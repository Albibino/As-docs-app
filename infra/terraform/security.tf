resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  description = "Entrada HTTP/HTTPS do balanceador publico"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project_name}-sg-alb" }
}

resource "aws_security_group" "frontend" {
  name_prefix = "${var.project_name}-frontend-"
  description = "Frontend acessivel por HTTP apenas pelo balanceador"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project_name}-sg-frontend" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP publico; redirecionamento HTTPS sera configurado no listener"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS publico; certificado e listener entram na etapa do ALB"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "alb_frontend" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.frontend.id
  description                  = "Balanceador encaminha HTTP ao Nginx"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_vpc_security_group_ingress_rule" "frontend_http" {
  security_group_id            = aws_security_group.frontend.id
  referenced_security_group_id = aws_security_group.alb.id
  description                  = "Nginx aceita HTTP somente do SG do ALB"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_vpc_security_group_egress_rule" "frontend_https" {
  security_group_id = aws_security_group.frontend.id
  description       = "Saida HTTPS para repositorios de pacotes, imagens e SSM"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "frontend_backend" {
  security_group_id = aws_security_group.frontend.id
  description       = "Frontend acessa o futuro NLB interno na porta da API"
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 3000
  to_port           = 3000
}
