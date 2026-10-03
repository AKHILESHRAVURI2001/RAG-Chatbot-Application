# ============================================================================
# S3 — static file storage
# ============================================================================
# Two buckets, two very different jobs:
#
#  1. "static" bucket: holds the built admin dashboard and widget.js —
#     the actual files a visitor's browser downloads. CloudFront (see
#     cloudfront.tf) sits in front of this and serves these files from
#     edge locations around the world, so it's never the app servers
#     handling this traffic.
#
#  2. "artifacts" bucket: holds the packaged server code (dist/ + package.json).
#     App servers download from here when they boot, instead of us needing
#     to manually copy files onto every server by hand.
#
# random_id adds a few random characters to each bucket name because S3
# bucket names must be globally unique across *all* AWS customers, not just
# your account — a plain name like "mcb-static" is almost certainly already
# taken by someone else.

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "static" {
  bucket = "${var.project_name}-static-${random_id.bucket_suffix.hex}"
  tags   = { Name = "${var.project_name}-static" }
}

# Public *ACLs* are blocked (no accidentally-public individual files), but
# a bucket *policy* is still allowed — that's how we deliberately grant
# CloudFront (and only CloudFront) read access below, without making the
# bucket itself public.
resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.project_name}-deploy-artifacts-${random_id.bucket_suffix.hex}"
  tags   = { Name = "${var.project_name}-deploy-artifacts" }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# The actual "only CloudFront can read this bucket" rule. AWS:SourceArn
# pins it to *this specific* CloudFront distribution — not just any
# CloudFront distribution in any AWS account.
resource "aws_s3_bucket_policy" "static_cloudfront_read" {
  bucket = aws_s3_bucket.static.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipal"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.static.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn }
      }
    }]
  })
}
