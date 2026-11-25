resource "aws_instance" "frontend" {
  for_each = local.base.public_subnets

  ami                         = data.aws_ssm_parameter.frontend_ami.value
  instance_type               = "t3.micro"
  subnet_id                   = each.value.id
  vpc_security_group_ids      = [local.base.security_group_ids.frontend]
  associate_public_ip_address = true
  iam_instance_profile        = data.aws_iam_instance_profile.frontend.name
  user_data                   = file("${path.module}/frontend-bootstrap.sh")
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }
  root_block_device {
    volume_size           = 10
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }
  credit_specification {
    cpu_credits = "standard"
  }
  volume_tags = { Project = "as-docs", ManagedBy = "Terraform", Stage = "06-borda" }
  tags        = { Name = "as-docs-frontend-${each.key}" }
}

resource "aws_lb" "public" {
  name                       = "as-docs-public"
  internal                   = false
  load_balancer_type         = "application"
  ip_address_type            = "ipv4"
  security_groups            = [local.base.security_group_ids.alb]
  subnets                    = [for zone in sort(keys(local.base.public_subnets)) : local.base.public_subnets[zone].id]
  drop_invalid_header_fields = true
  desync_mitigation_mode     = "strictest"
  idle_timeout               = 300

  lifecycle {
    precondition {
      condition     = length(local.base.public_subnets) == 2 && (!local.legacy_network || local.base.vpc_id == "vpc-04354398b0920234a")
      error_message = "A borda exige duas sub-redes públicas e, no modo legado, a VPC original."
    }
  }
}

resource "aws_lb_target_group" "frontend" {
  name        = "as-docs-frontend"
  target_type = "instance"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = local.base.vpc_id
  health_check {
    path                = "/healthz"
    protocol            = "HTTP"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }
}

resource "aws_lb_target_group_attachment" "frontend" {
  for_each         = aws_instance.frontend
  target_group_arn = aws_lb_target_group.frontend.arn
  target_id        = each.value.id
  port             = 80
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.public.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = local.tls_enabled ? "redirect" : "forward"
    target_group_arn = local.tls_enabled ? null : aws_lb_target_group.frontend.arn
    dynamic "redirect" {
      for_each = local.tls_enabled ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        host        = var.public_hostname
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.tls_enabled ? 1 : 0
  load_balancer_arn = aws_lb.public.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener_rule" "block_mcp" {
  for_each = local.tls_enabled ? {
    http = aws_lb_listener.http.arn, https = aws_lb_listener.https[0].arn
  } : { http = aws_lb_listener.http.arn }
  listener_arn = each.value
  priority     = 10
  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
  condition {
    path_pattern { values = ["/mcp*"] }
  }
}
