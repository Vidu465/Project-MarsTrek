output "site_url" {
  description = "HTTPS URL for the deployed site. CloudFront may take several minutes to finish deploying."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "s3_bucket_name" {
  description = "Private S3 bucket name for the built frontend files."
  value       = aws_s3_bucket.site.id
}

output "cloudfront_distribution_id" {
  description = "Distribution ID, used for cache invalidation after uploading a new build."
  value       = aws_cloudfront_distribution.site.id
}
