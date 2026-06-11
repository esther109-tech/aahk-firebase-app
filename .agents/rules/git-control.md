# Git Version Control Automation
## Context
The primary upstream remote repository for this workspace (`firebase-studio`) is explicitly mapped to:
https://github.com/esther109-tech/aahk-firebase-app

## Instructions
When the user requests "help me git version control", autonomously execute the following sequential workflow using your terminal tool execution capabilities:

1. **Status Check:** Run `git status` to check for untracked or modified files.
2. **Staging:** Stage all current working directory modifications using `git add .`.
3. **Commit:** Formulate a concise, semantic commit message detailing the changes, and commit them using `git commit -m "<message>"`.
4. **Target Verification:** Check the configured remotes. If the target repository `https://github.com/esther109-tech/aahk-firebase-app` is not set up as an active remote (e.g., `origin`), add it or set the URL using:
   `git remote set-url origin https://github.com/esther109-tech/aahk-firebase-app`
5. **Push:** Securely push the committed state to the tracking branch using `git push origin main` (or your current active branch).
6. **Reporting:** Provide a final status summary output confirming the push was successfully transmitted to `esther109-tech/aahk-firebase-app`.
