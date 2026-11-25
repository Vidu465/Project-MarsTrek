variable "aws_region" {
  description = "AWS region used to create the S3 bucket. CloudFront is a global service."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Lowercase project name used in AWS resource names."
  type        = string
  default     = "marstrek"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$", var.project_name))
    error_message = "project_name must be 3-30 characters, start and end with a lowercase letter or number, and use only lowercase letters, numbers, and hyphens."
  }
}

variable "cloudfront_price_class" {
  description = "CloudFront edge location price class. PriceClass_100 covers North America and Europe."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "Choose PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}
