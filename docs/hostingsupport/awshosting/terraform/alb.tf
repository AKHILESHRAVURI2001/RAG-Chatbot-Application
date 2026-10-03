# ============================================================================
# LOAD BALANCER — spreads traffic across however many app servers exist
# ============================================================================
# The Application Load Balancer (ALB) is the one thing on the public
# internet in front of the app. It does two jobs:
#   1. Routes each incoming request to one of the healthy app servers
#      (round-robin — no single server gets overloaded while others idle)
#   2. Continuously health-checks every server on /api/health, and stops
#      sending traffic to any server that fails 3 checks in a row —
#      this is what makes a crashed server "self-healing" instead of
#      silently serving errors to real users

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false # false = has a public address
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = { Name = "${var.project_name}-alb" }
}

# The "target group" is the actual list of app servers the ALB sends
# traffic to, plus the rules for how it decides they're healthy.
resource "aws_lb_target_group" "app" {
  name     = "${var.project_name}-app-tg"
  port     = 4000
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/api/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = "${var.project_name}-app-tg" }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
