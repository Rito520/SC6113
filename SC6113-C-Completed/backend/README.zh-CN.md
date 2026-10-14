#### C 后端与 B 合约整合说明

这份后端已经按 B 的实际合约接口完成调整。B 的三份合约仍然负责资金、权限和状态变化，C 负责钱包登录、REST API、SQLite 数据、链下正文以及链上交易核验。两部分放在同一个项目中，但代码仍按 `contracts/` 和 `backend/` 分开，后续合并 D 前端时不需要再次拆分。

后端不会保存用户私钥，也不会代替 Client、Freelancer 或 Arbitrator 发交易。用户先通过 MetaMask 调用 B 的合约，交易确认后再把 `transactionHash` 和链下内容交给后端。后端会检查 chain ID、发送钱包、目标合约、调用函数、参数、ETH 数额和确认数，并解析交易事件；任何一项对不上，链下记录都不会写入数据库。

#### 已完成内容

- 使用 MetaMask 消息签名登录，登录本身不消耗 Gas。
- EVM 模式从 `RoleManager.rolesOf` 读取角色，不相信浏览器自行上报的角色。
- 同一个钱包可以同时拥有 Client、Freelancer 等多个角色。
- 保存项目、里程碑、提交说明、拒绝理由、争议、证据和裁决正文。
- 保存 B 合约产生的 `projectId`、milestone index 和 `disputeId`，并与本地 UUID 对应。
- ETH 同时保存显示用十进制字符串和精确 wei 字符串。
- 对链下正文生成固定的 `bytes32` 哈希，再与合约交易参数核对。
- 保存已确认交易及解析后的事件，记录区块号、交易序号和日志序号，避免重复写入。
- 保留 Mock 模式，便于不启动链时测试 API；Mock 哈希不能当作真实链上结果。
- 补充了项目取消、里程碑开始、争议证据等原后端缺少的流程，并使先付款后接受、先接受后付款两条路径都与 B 合约一致。

#### 本地运行

需要 Node.js 24 或更高版本。先启动本地链，再部署 B，最后启动 C：

```powershell
# 窗口 1
cd contracts
npm install
npm run node

# 窗口 2
cd contracts
$env:SEED_DEMO='true'
npm run deploy:localhost

# 窗口 3
cd backend
pnpm install
Copy-Item .env.example .env
# 把 .env 中的 CHAIN_MODE 改为 evm
pnpm dev
```

本地链的 chain ID 是 `31337`。部署脚本会生成 `contracts/deployments/localhost.json` 和三份 ABI。如果重新启动了 Hardhat node，必须重新部署；如果地址发生变化，也要同步修改 `backend/.env`。

只检查后端 API 时可以保留 `CHAIN_MODE=mock`。实际演示 B/C 对接时必须使用 `CHAIN_MODE=evm`，并确认 `/health` 返回的链模式是 `evm`。

#### 链上交易与 REST 的先后顺序

每个写操作统一采用以下顺序：MetaMask 发交易 → 等待 receipt → 将 `transactionHash` 和正文发给对应 REST API → 后端核验并保存。

比如 Freelancer 提交里程碑时，链上参数需要带提交内容的哈希，REST 请求则提交完整 `note`、可选 `evidenceUrl` 和同一笔交易的哈希。后端重新计算正文哈希，如果结果与 `submitMilestone` 或 `resubmitMilestone` 的第三个参数不同，请求会被拒绝。

项目、里程碑、提交、拒绝、争议、证据和裁决使用的 JSON 形状已经固定，详见 `docs/B-C-INTEGRATION.md`。日期按 UTC 当天 `00:00:00` 转换为 Unix 秒，金额必须使用字符串，比如 `"1.5"`。

#### 检查结果与实际边界

本次已重新运行 B 的 Hardhat 测试，结果为 32 项通过；C 的 API 测试为 2 项通过；另外启动本地链、部署合约并执行两条演示流程后，C 的真实回执集成测试为 1 项通过。该集成测试实际检查了角色读取、交易发送人、目标合约、函数参数和事件解析。

这些结果证明本机 Hardhat 环境下的 B/C 接口能够工作。目前没有 Sepolia 或其他公开测试网部署记录，也没有验证 D 前端、公开服务器、多实例数据库和真实浏览器完整流程，提交报告时不能把本地测试写成已经公开部署。

#### 后续交接

D 只需要按照 `docs/B-C-INTEGRATION.md` 计算相同哈希、调用 B 合约并把确认后的 `transactionHash` 发给 C。E 后续部署时需要决定公开 RPC、合约地址、后端域名、CORS 和数据库方案。B 如果修改函数、事件或状态规则，应同时更新 ABI 和这份对接文档，不能只替换 Solidity 文件。
