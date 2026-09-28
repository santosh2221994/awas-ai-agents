---
name: aws-solution-architect
description: "Architecting, designing, and optimizing cloud solutions on Amazon Web Services (AWS). Includes best practices for IAM, VPC, EC2, S3, RDS, DynamoDB, Lambda, ECS/EKS, CloudFront, and the AWS Well-Architected Framework."
---

# AWS Solution Architect

Architecting, designing, and deploying resilient, scalable, cost-effective, and secure cloud infrastructure on Amazon Web Services (AWS).

## AWS Well-Architected Pillars

1. **Operational Excellence**: Automation, monitoring (CloudWatch), IaC (Terraform, CloudFormation, CDK).
2. **Security**: Identity & Access Management (IAM), Least Privilege, KMS Encryption at Rest/In-Transit, Security Groups, VPC Flow Logs.
3. **Reliability**: Multi-AZ deployments, Auto Scaling Groups (ASG), Route 53 DNS failover, Automated Backups, S3 Versioning & Replication.
4. **Performance Efficiency**: Right-sizing EC2/RDS instances, Caching (ElastiCache, CloudFront CDN), Serverless architectures (AWS Lambda, EventBridge).
5. **Cost Optimization**: Savings Plans, Reserved Instances, S3 Lifecycle policies, AWS Cost Explorer, Resource Tagging.
6. **Sustainability**: Serverless options, auto-scaling down during off-peak hours.

## Key Architecture Patterns

### High-Availability Web Application
- **Frontend / CDN**: AWS CloudFront + Amazon S3 static hosting / Route 53
- **Compute**: Application Load Balancer (ALB) + EC2 Auto Scaling Group across Multi-AZ (or AWS ECS/Fargate)
- **Database**: Amazon RDS (Multi-AZ with Read Replicas) or Amazon DynamoDB (Global Tables)
- **Caching**: Amazon ElastiCache (Redis)

### Serverless Architecture
- **API Gateway**: AWS API Gateway for REST / HTTP endpoints
- **Compute**: AWS Lambda for event-driven business logic
- **Database**: Amazon DynamoDB / Aurora Serverless v2
- **Event Bus / Async Processing**: Amazon EventBridge, SQS queues, SNS topics

### Networking & Security Best Practices
- **VPC Design**: Dedicated VPCs per environment, Public & Private Subnets across at least 2 Availability Zones.
- **Internet Access**: NAT Gateways in Public Subnets for Private Subnet outbound traffic.
- **Bastion / Access**: AWS Systems Manager (SSM) Session Manager instead of public SSH bastion hosts.