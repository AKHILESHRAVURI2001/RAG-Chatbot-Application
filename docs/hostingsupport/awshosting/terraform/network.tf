# ============================================================================
# NETWORKING — the private "building" everything else lives inside
# ============================================================================
# A VPC (Virtual Private Cloud) is your own isolated slice of the AWS
# network — nothing in it is reachable from the internet unless you
# explicitly open a door. Inside it, we carve out 4 smaller ranges
# ("subnets"), spread across 2 physically separate data centers
# ("Availability Zones") so a single data center outage doesn't take
# the whole app down:
#
#   - 2 PUBLIC subnets  -> the load balancer lives here (has a public IP)
#   - 2 PRIVATE subnets -> the app servers, database, and cache live here
#                          (no public IP, unreachable directly from the internet)
#
# The private subnets still need to reach the *internet* one-way (to run
# `npm install`, download OS security updates, etc.) without being
# reachable *from* the internet. A NAT Gateway does exactly that — it's
# like a one-way mirror for outbound traffic.

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project_name}-vpc" }
}

# The door between the VPC and the public internet — required for anything
# in a public subnet to be reachable, and for the NAT Gateway to work.
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-igw" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)      # .0.0/20, .16.0/20
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true # instances here get a public IP automatically

  tags = { Name = "${var.project_name}-public-${count.index + 1}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 2)        # .32.0/20, .48.0/20
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Name = "${var.project_name}-private-${count.index + 1}" }
}

# A NAT Gateway needs its own fixed public IP address to present to the
# internet on behalf of everything behind it.
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${var.project_name}-nat" }

  depends_on = [aws_internet_gateway.main]
}

# A "route table" is the map of "traffic to X goes out via Y" for a subnet.
# Public subnets route everything to the Internet Gateway (direct access).
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.project_name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private subnets route everything outbound through the NAT Gateway instead
# (one-way: they can reach the internet, the internet can't reach them).
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "${var.project_name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
