# ============================================================================
# AUTO SCALING GROUP — keeps the right number of healthy app servers running
# ============================================================================
# This is the piece that makes the deployment "elastic" and "self-healing":
#   - Elastic: automatically launches more app servers when average CPU
#     usage across the fleet goes above 60%, and removes extras when load
#     drops back down — traffic growth doesn't require anyone to
#     manually add servers.
#   - Self-healing: if an app server crashes or fails its health check,
#     the ALB stops sending it traffic and the ASG replaces it with a
#     fresh one from the Launch Template — automatically, with no
#     human intervention.

resource "aws_autoscaling_group" "app" {
  name                = "${var.project_name}-asg"
  vpc_zone_identifier = aws_subnet.private[*].id
  min_size            = var.asg_min_size
  max_size            = var.asg_max_size
  desired_capacity    = var.asg_desired_capacity

  # "ELB" health checks mean the ASG trusts the load balancer's own
  # /api/health checks to decide if an instance is healthy, not just
  # "is the instance powered on" (EC2's default, much weaker check).
  health_check_type         = "ELB"
  health_check_grace_period = 180 # give a fresh instance 3 minutes to finish booting before judging it

  target_group_arns = [aws_lb_target_group.app.arn]

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-app"
    propagate_at_launch = true
  }
}

# The actual "add more servers when busy" rule. Target-tracking scaling
# means you just say the target (60% CPU) and AWS handles the math of
# how many servers to add or remove to hit it — no manual thresholds.
resource "aws_autoscaling_policy" "cpu_target_tracking" {
  name                   = "${var.project_name}-cpu-target-tracking"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60.0
  }
}
