# ============================================================================
# CLOUDFRONT — the CDN, and the one public URL for the whole app
# ============================================================================
# CloudFront is AWS's Content Delivery Network: it caches content at edge
# locations physically close to each visitor around the world, so a static
# file (the admin dashboard, widget.js) loads fast no matter where the
# visitor is, without that request ever reaching the app servers.
#
# This distribution has two "origins" — two different places it can pull
# content from — and routes based on the URL path:
#   - anything under /api/*  -> the ALB (dynamic, talks to the app servers)
#   - everything else        -> the S3 static bucket (the built admin app + widget.js)

# An Origin Access Control is how CloudFront authenticates to the private
# S3 bucket — it's what the bucket policy in s3.tf grants access to. The
# bucket itself has no public access at all; only CloudFront, through this,
# can read it.
resource "aws_cloudfront_origin_access_control" "static" {
  name                              = "${var.project_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed cache policies — reusing AWS's own presets instead of
# hand-rolling cache-header logic:
#   CachingOptimized      -> cache aggressively (good for static files)
#   CachingDisabled       -> never cache (correct for a dynamic API)
#   AllViewerExceptHostHeader -> forward all headers/cookies/query strings to the API
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${var.project_name} static + api"
  price_class         = "PriceClass_100" # cheapest tier: North America + Europe edge locations only

  origin {
    origin_id                = "s3-static"
    domain_name               = aws_s3_bucket.static.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.static.id
  }

  origin {
    origin_id   = "alb-api"
    domain_name = aws_lb.main.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-static"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "alb-api"
    viewer_protocol_policy    = "redirect-to-https"
    allowed_methods           = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods            = ["GET", "HEAD"]
    cache_policy_id           = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id  = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true # the built-in *.cloudfront.net HTTPS cert; swap for ACM + a custom domain later
  }

  tags = { Name = "${var.project_name}-cloudfront" }
}
