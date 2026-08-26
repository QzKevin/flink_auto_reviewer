# 友链自动审核演示站

这是一个完整的友链提交演示项目：访客通过 Vue 表单提交友链信息，Node.js 云函数触发 GitHub Actions 创建待审核 PR；人工审核窗口保留 12 小时，若超时仍未处理，定时巡检工作流会自动审核并合并。

## 项目结构

```txt
.
├─ apps/web/                    # Vue + Vite 前端演示站
├─ api/
│  ├─ friends.js                # 读取 data/friends.json
│  └─ submit-link.js            # Vercel/Node.js 提交接口
├─ data/
│  ├─ friends.json              # 友链数据源
│  └─ schema/friend-link.schema.json
├─ scripts/
│  ├─ lib/link.mjs              # 友链标准化与校验逻辑
│  ├─ validate-friends.mjs      # 本地/CI 数据校验
│  ├─ ensure-labels.mjs         # 初始化/更新 GitHub PR 标签
│  ├─ create-link-pr.mjs        # workflow_dispatch 后生成 PR 改动
│  ├─ scan-pending-prs.mjs      # 60 分钟巡检并自动审核
│  └─ auto-merge-link-pr.mjs    # 自动合并入口别名
└─ .github/workflows/
   ├─ ci.yml
   ├─ link-submit.yml
   └─ link-review-watch.yml
```

## 工作流说明

1. 访客填写并提交友链表单。
2. `/api/submit-link` 完成基础校验后调用 GitHub REST API 触发 `link-submit.yml`。
3. `link-submit.yml` 会先初始化所需 GitHub Labels，再将友链写入新分支的 `data/friends.json`，并创建带有以下标签的 PR：
   - `friend-link`
   - `pending-review`
   - `auto-review-after-12h`
4. 维护者可以在 12 小时内人工修改、合并或关闭 PR。
5. `link-review-watch.yml` 每 60 分钟运行一次，扫描已满 12 小时且仍处于 `pending-review` 的友链 PR。
6. 如果主分支已经存在该友链，则巡检会关闭 PR 并标记 `already-added`。
7. 如果 PR 仍未处理，巡检会再次校验 URL、重复项、站点可访问性和头像可访问性；通过后自动 squash merge，失败则评论原因并标记 `auto-review-failed`。

## 本地开发

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

开发服务器默认运行在：

```txt
http://localhost:5173
```

本地只跑前端时，`/api/*` 代理到 `http://localhost:3000`。如果要完整调试 Vercel 函数，建议使用 Vercel CLI：

```bash
npm install -g vercel
vercel dev
```

## 常用命令

```bash
npm run validate:friends
npm run typecheck
npm run build
npm run check
```

## Vercel 部署说明

### 1. 导入项目

将本项目推送到 GitHub 后，在 Vercel 中选择该仓库导入。项目已经包含 `vercel.json`：

```json
{
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

Vercel 会构建 Vue 前端，并自动部署 `/api/friends` 与 `/api/submit-link` 两个 Node.js 函数。

建议在 Vercel 项目设置中保持：

```txt
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

不要把 Root Directory 设置成 `apps/web`，否则仓库根目录下的 `api/` 云函数不会一起部署。

### 2. Vercel 构建失败排查

如果 Vercel 日志里出现：

```txt
npm warn allow-scripts ... esbuild@... (postinstall: node install.js)
```

通常说明 npm 在提醒 `esbuild` 带有安装脚本。项目已在 `package.json` 中显式允许 `esbuild`，并通过 `.npmrc` 关闭本地生成 `package-lock.json`，避免 Windows 生成的 lockfile 只锁定 `win32` 原生包，导致 Vercel 的 Linux 构建机缺少 `esbuild` 或 `rollup` 的 Linux 二进制依赖。

如果 Vercel 日志里出现：

```txt
Error: No Output Directory named "dist" found after the Build completed.
```

请确认 Vercel 项目设置里的 Output Directory 是 `dist`，并且已推送包含 `apps/web/vite.config.mjs` 中 `build.outDir = "../../dist"` 的最新提交。修改构建配置后，建议执行一次 `Redeploy -> Clear Build Cache and Redeploy`。

请确认提交到 GitHub 的文件中不要包含 `package-lock.json`。如果已经提交过，删除后重新提交：

```bash
git rm package-lock.json
git commit -m "Fix Vercel npm platform dependencies"
git push
```

### 3. 配置环境变量

在 Vercel 项目设置中添加：

```env
GITHUB_OWNER=你的 GitHub 用户名或组织名
GITHUB_REPO=仓库名
GITHUB_REF=main
GITHUB_WORKFLOW_ID=link-submit.yml
GITHUB_TOKEN=用于触发 workflow_dispatch 的 GitHub Token
ALLOWED_ORIGIN=https://你的-vercel-域名.vercel.app
DRY_RUN_SUBMISSIONS=false
```

`GITHUB_TOKEN` 不会进入前端，只存在于 Vercel 云函数。建议使用 fine-grained token，并仅授予目标仓库触发 Actions 所需权限。

### 4. 首次预览测试

如果你只想先测试表单与接口响应，可以临时设置：

```env
DRY_RUN_SUBMISSIONS=true
```

这会让 `/api/submit-link` 返回提交成功，但不会真正触发 GitHub Actions。确认前端表单正常后，再切回：

```env
DRY_RUN_SUBMISSIONS=false
```

## GitHub 配置说明

### Actions 权限

进入仓库：

```txt
Settings -> Actions -> General -> Workflow permissions
```

建议选择：

```txt
Read and write permissions
Allow GitHub Actions to create and approve pull requests
```

### Labels 初始化

工作流会自动创建或更新所需的 PR Labels，包括：

```txt
friend-link
pending-review
auto-review-after-12h
already-added
auto-review-passed
auto-review-failed
needs-human-review
do-not-auto-merge
```

如果旧版本运行时报 `could not add label: 'friend-link' not found`，说明当时仓库还没有对应 Label。推送当前版本后重新提交一次友链即可；也可以在 GitHub 仓库的 `Issues -> Labels` 中手动创建同名标签。

### 可选仓库变量

进入：

```txt
Settings -> Secrets and variables -> Actions -> Variables
```

可配置：

```env
SITE_BASE_URL=https://你的站点域名
REQUIRE_BACKLINK=false
```

如果将 `REQUIRE_BACKLINK` 设置为 `true`，自动审核会要求对方站点页面源码中包含 `SITE_BASE_URL` 或其 hostname。

## 人工审核规则

对自动创建的友链 PR，可以使用标签控制行为：

```txt
needs-human-review      # 保留人工审核，不自动合并
do-not-auto-merge       # 禁止自动合并
```

如果没有以上标签，且 PR 保持 `pending-review` 超过 12 小时，下一次整点后约 17 分钟的巡检会尝试自动审核。

## 友链数据格式

`data/friends.json` 是最终友链数据源：

```json
[
  {
    "name": "Example Blog",
    "url": "https://example.com",
    "avatar": "https://example.com/avatar.png",
    "description": "A personal blog.",
    "rss": "https://example.com/feed.xml",
    "source": "manual",
    "createdAt": "2026-08-26T00:00:00.000Z"
  }
]
```

`contact` 字段只允许出现在提交 payload 和 PR 描述中，不会写入 `friends.json`。

## 自动审核策略

当前自动审核包含：

- 必须使用 `https`
- 禁止 localhost、内网 IP、保留地址和 `.local`
- 名称长度 2 到 60 个字符
- 描述长度 5 到 120 个字符
- 不允许重复 URL
- 站点 URL 必须可访问
- 头像 URL 如果提供，也必须可访问
- 可选检查对方站点是否包含本站反链

## 重要说明

`link-review-watch.yml` 使用：

```yml
schedule:
  - cron: "17 * * * *"
```

也就是每 60 分钟运行一次。它不会让某个 workflow 挂起等待 12 小时，而是在每次巡检时检查 PR 是否已经超过 12 小时；因此实际自动审核时间是“满 12 小时后的下一次巡检”。
