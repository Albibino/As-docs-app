resource "aws_security_group" "nlb" {
  name        = "as-docs-nlb-internal"
  description = "NLB privado: somente as EC2 frontend na porta 3000"
  vpc_id      = local.base.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "frontend_nlb" {
  security_group_id            = aws_security_group.nlb.id
  referenced_security_group_id = local.base.security_group_ids.frontend
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_vpc_security_group_egress_rule" "nlb_nodes" {
  security_group_id            = aws_security_group.nlb.id
  referenced_security_group_id = local.base.eks_cluster_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 30300
  to_port                      = 30300
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_nlb" {
  security_group_id            = local.base.eks_cluster_security_group_id
  referenced_security_group_id = aws_security_group.nlb.id
  ip_protocol                  = "tcp"
  from_port                    = 30300
  to_port                      = 30300
  description                  = "NodePort do backend e health check somente pelo NLB"
}

resource "aws_lb" "backend" {
  name                             = "as-docs-internal"
  internal                         = true
  load_balancer_type               = "network"
  ip_address_type                  = "ipv4"
  security_groups                  = [aws_security_group.nlb.id]
  subnets                          = [for zone in sort(keys(local.base.private_subnets)) : local.base.private_subnets[zone].id]
  enable_cross_zone_load_balancing = true
}

resource "aws_lb_target_group" "backend" {
  name                 = "as-docs-backend"
  vpc_id               = local.base.vpc_id
  target_type          = "instance"
  protocol             = "TCP"
  port                 = 30300
  preserve_client_ip   = true
  deregistration_delay = 30
  health_check {
    protocol            = "HTTP"
    port                = "traffic-port"
    path                = "/api/health/live"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

resource "aws_lb_listener" "backend" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 3000
  protocol          = "TCP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# Anexa o target group ao ASG ja gerenciado pelo EKS. O ASG registra novos nos
# automaticamente; este state nao passa a gerenciar a escala nem o node group.
resource "aws_autoscaling_attachment" "backend" {
  autoscaling_group_name = one(one(data.aws_eks_node_group.backend.resources).autoscaling_groups).name
  lb_target_group_arn    = aws_lb_target_group.backend.arn
}
