# 12. CloudFront (the Public URL)

← [Back to overview](README.md) | **You are here: Step 12 of 13** | ← Previous: [11. Getting Onto an Instance](11-access-instance.md)

Search for the **CloudFront** service.

## 12.1 Origin Access Control (lets CloudFront read your private S3 bucket)
Left sidebar → **Origin access** → **Create control setting**.
- Name: `mcb-oac`
- Signing behavior: Sign requests (recommended)
- **Create**

## 12.2 The distribution
Left sidebar → **Distributions** → **Create distribution**.

- **Origin domain**: click into the field and select your static S3 bucket (from [step 5](05-s3.md)) from the dropdown.
- **Origin access control settings**: select `mcb-oac`. The Console will show a banner offering to update the S3 bucket policy for you — **let it do that** (this is the step that makes the earlier "fully private bucket" actually work with CloudFront).
- **Default cache behavior**: Viewer protocol policy → **Redirect HTTP to HTTPS**; Cache policy → **CachingOptimized**.
- **Default root object**: `index.html`
- **Create distribution**.

Wait for **Last modified** status to show it's deployed (5-15 minutes), then note the **Distribution domain name** (`dxxxxxxxxxxxxx.cloudfront.net`) — this is your live URL for the admin dashboard and widget.

> If you built the admin dashboard before this step existed, go back to [step 10](10-build-and-upload-code.md) now and rebuild it with `VITE_API_BASE_URL=https://YOUR_DISTRIBUTION_DOMAIN/api`, then re-upload — otherwise it's still pointing at `localhost`.

## 12.3 Add the API route
Once created, open the distribution → **Origins** tab → **Create origin**:
- **Origin domain**: paste your ALB's DNS name (from [step 8](08-load-balancer.md))
- **Protocol**: HTTP only
- **Create origin**

Then → **Behaviors** tab → **Create behavior**:
- **Path pattern**: `/api/*`
- **Origin**: the ALB origin you just created
- **Viewer protocol policy**: Redirect HTTP to HTTPS
- **Allowed HTTP methods**: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE** (the API needs to accept more than just reads)
- **Cache policy**: **CachingDisabled** (never cache API responses)
- **Origin request policy**: **AllViewerExceptHostHeader**
- **Create behavior**

## ✅ Checkpoint before moving on
- Distribution status is **Enabled** / deployed
- `https://YOUR_DISTRIBUTION_DOMAIN/` loads *something* (even if the admin dashboard shows a login screen with no working API yet — that's expected until you rebuild it with the right URL)

---
**Next →** [13. Verify Everything Works](13-verify.md)
