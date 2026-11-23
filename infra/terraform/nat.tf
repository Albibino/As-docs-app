resource "aws_eip" "nat" {
  for_each = local.zones

  domain = "vpc"

  tags = {
    Name  = "${var.project_name}-nat-${each.key}"
    Stage = "03-eks"
  }
}

resource "aws_nat_gateway" "outbound" {
  for_each = local.zones

  allocation_id     = aws_eip.nat[each.key].id
  subnet_id         = aws_subnet.public[each.key].id
  connectivity_type = "public"

  tags = {
    Name  = "${var.project_name}-nat-${each.key}"
    Stage = "03-eks"
  }

  depends_on = [
    aws_internet_gateway.main,
    aws_route.public_internet,
    aws_route_table_association.public,
  ]
}

resource "aws_route" "private_internet" {
  for_each = local.zones

  route_table_id         = aws_route_table.private[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.outbound[each.key].id
}
