# AWS CLI — Manual Setup

This is the reference setup, **built step by step**: typing `aws` CLI commands one at a time, by hand, in order. No Terraform, no other tool — just the same `aws` command you'd use for anything else, run step by step.

This is the "learn what each piece really does" path. For the same architecture in a reusable, repeatable form, see [`../terraform/`](../terraform/README.md) instead — that's a *different, independent* way to create the same kind of stack, not a continuation of these files.

- [`manual-setup.md`](manual-setup.md) — every command, in the order it has to run, with the reasoning for each step.
- [`redeploy.md`](redeploy.md) — how to ship a code change to the stack these commands built.

For bugs and their fixes, see [`../troubleshooting.md`](../troubleshooting.md) (shared with the Terraform path — most of these are app-level issues, not specific to how the infrastructure was provisioned).
