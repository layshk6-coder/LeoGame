#!/usr/bin/env bash
# LeoGame 安全部署脚本
#
# 目标：显式使用 layshk6-coder 的专用 GitHub token，把 main 分支部署到 GitHub Pages。
# 前提：macOS Keychain 中存在 generic password：github-layshk6-coder
# 用法：
#   ./deploy.sh                 # 提交所有变更并部署
#   ./deploy.sh "提交说明"       # 使用指定提交说明
#   COMMIT_MSG="提交说明" ./deploy.sh

set -euo pipefail

GAME_DIR="$(cd "$(dirname "$0")" && pwd)"
OWNER="layshk6-coder"
REPO="LeoGame"
REMOTE_URL="https://github.com/${OWNER}/${REPO}.git"
BRANCH="main"
PAGES_URL="https://${OWNER}.github.io/${REPO}/"
KEYCHAIN_SERVICE="github-layshk6-coder"

cd "$GAME_DIR"

fail() {
  echo "❌ $*" >&2
  exit 1
}

info() {
  echo "▶ $*"
}

# 1. 基础安全检查
CURRENT_REMOTE="$(git remote get-url origin 2>/dev/null || true)"
case "$CURRENT_REMOTE" in
  *"github.com/${OWNER}/${REPO}.git"|*"github.com/${OWNER}/${REPO}") ;;
  *) fail "当前 origin 不是 ${OWNER}/${REPO}：${CURRENT_REMOTE}" ;;
esac

CURRENT_BRANCH="$(git branch --show-current)"
[ "$CURRENT_BRANCH" = "$BRANCH" ] || fail "当前分支是 ${CURRENT_BRANCH}，应为 ${BRANCH}"

# 2. 读取专用 token。优先环境变量，备用 macOS Keychain。
TOKEN="${LEOGAME_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  command -v security >/dev/null 2>&1 || fail "找不到 security 命令，也没有设置 LEOGAME_GITHUB_TOKEN/GITHUB_TOKEN"
  TOKEN="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
fi
[ -n "$TOKEN" ] || fail "没有找到 GitHub token。请在 Keychain 中保存 ${KEYCHAIN_SERVICE}，或设置 LEOGAME_GITHUB_TOKEN"

# 3. 检查 GitHub Pages 当前是否从 main:/ 发布。
if command -v gh >/dev/null 2>&1; then
  PAGES_SOURCE="$(gh api "repos/${OWNER}/${REPO}/pages" --jq '.source.branch + ":" + .source.path' 2>/dev/null || true)"
  if [ -n "$PAGES_SOURCE" ] && [ "$PAGES_SOURCE" != "${BRANCH}:/" ]; then
    fail "GitHub Pages source 是 ${PAGES_SOURCE}，不是 ${BRANCH}:/"
  fi
fi

# 4. 确保有东西可提交。
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  info "没有本地变更需要部署。"
else
  git add -A
  COMMIT_MSG="${COMMIT_MSG:-${1:-🎮 更新 LeoGame}}"
  git commit -m "$COMMIT_MSG"
fi

LOCAL_SHA="$(git rev-parse HEAD)"
info "准备推送 ${BRANCH}: ${LOCAL_SHA:0:7}"

# 5. 用临时 askpass 显式提供 token，避免依赖当前 gh 登录账号或系统默认 git 凭据。
ASKPASS_FILE="$(mktemp)"
trap 'rm -f "$ASKPASS_FILE"' EXIT
cat > "$ASKPASS_FILE" <<'ASKPASS'
#!/usr/bin/env bash
case "$1" in
  *Username*) printf '%s\n' 'layshk6-coder' ;;
  *Password*) printf '%s\n' "$LEOGAME_GITHUB_TOKEN" ;;
  *) printf '\n' ;;
esac
ASKPASS
chmod 700 "$ASKPASS_FILE"

GIT_ASKPASS="$ASKPASS_FILE" \
GIT_TERMINAL_PROMPT=0 \
LEOGAME_GITHUB_TOKEN="$TOKEN" \
git -c credential.helper= push "$REMOTE_URL" "${BRANCH}:${BRANCH}"

# 6. 验证远端 main 已经指向本地提交。
REMOTE_SHA="$(git ls-remote "$REMOTE_URL" "refs/heads/${BRANCH}" | awk '{print $1}')"
[ "$REMOTE_SHA" = "$LOCAL_SHA" ] || fail "远端 ${BRANCH} 未更新到本地提交：remote=${REMOTE_SHA:0:7}, local=${LOCAL_SHA:0:7}"
info "远端 ${BRANCH} 已更新：${REMOTE_SHA:0:7}"

# 7. 验证公开 Pages 可访问。GitHub Pages 可能需要短暂构建，最多等约 2 分钟。
info "等待并验证 Pages：${PAGES_URL}"
python3 - <<PY
import sys, time, urllib.request
url = "$PAGES_URL"
expected_missing = ['snake/', '贪吃蛇']
last = None
for i in range(12):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LeoGameDeployCheck/1.0', 'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=15) as r:
            text = r.read().decode('utf-8', 'ignore')
            ok = r.status == 200 and all(s not in text for s in expected_missing)
            last = f'HTTP {r.status}, snake_removed={all(s not in text for s in expected_missing)}'
            if ok:
                print('✅ Pages 验证通过：' + last)
                sys.exit(0)
    except Exception as e:
        last = repr(e)
    time.sleep(10)
print('❌ Pages 验证失败，最后状态：' + str(last), file=sys.stderr)
sys.exit(1)
PY

info "部署完成：${PAGES_URL}"
