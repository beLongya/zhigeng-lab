# 知行副本 · 自由话题版本 QA

日期：2026-09-09。当前为开发中版本，未发布到线上。

## Findings

- [P1 / 外部服务] 任意话题真实生成尚未端到端通过。浏览器提交「如何读懂印象派绘画？」后，第一次收到完整模型结构但目标选项超过旧 30 字限制。诊断确认方向选项长 47–54 字，已将校验上限调整为 180 字，并在提示词中要求短标签。修复后重试得到知乎 rate-limit 错误。停止重试；输入保留、旧计划未被假结果替换。真实新计划展示、真实带教反馈仍须补验。
- [P2 / 已修复] 旧全局 p 颜色污染深色对话正文，对比不足。新主题显式继承正文颜色，并单独定义弱化文字和强调色。
- [P2 / 已修复] 手机从下方「开始探索」进入后停留在页面底部。现在任务切换、旅程切换时回到顶部。mobile-task-v2.png 与 DOM scrollY=0 确认修复。
- [P3 / 保留] 当前系统中文宋体与视觉稿的字面宽度、背景星球位置不是像素级一致。两栏比例、标题层级、黑洞素材与深色空间感已保留。后续可引入获许可的中文 Web 字体进一步统一设备效果。
- [P3 / 保留] 默认计划增加自定义目标输入、整体编辑入口和来源说明，移除无功能的附件入口与匿名头像；这些是功能性取舍，不声称完全复制原稿。

## Visual evidence

- Source visual truth: `C:/Users/Lenovo/.codex/generated_images/01a06af0-bf2d-7130-80bc-3ecd70b09fb0/exec-115e8d2b-7470-41da-884a-18d3926c6da0.png`
- Implementation: `C:/Users/Lenovo/Desktop/test/zhihu/zhixing-quest/outputs/design-qa/desktop-final.png`
- Source dimensions: 1487 × 1058 pixels.
- Browser CSS viewport: 1487 × 1058; content width 1472 (15 px scrollbar), no horizontal overflow. Screenshot captured via in-app browser, no manual scaling applied. Browser capture softness remains a fidelity-inspection limitation; exact font rasterization equivalence is not asserted.
- State: root route, default black-hole example, editing closed, no task active, automatic space theme, no request pending. Reference selects a goal; implementation intentionally leaves choice unselected.
- Full-view comparison: source and desktop-v2 were presented together in one comparison tool input; source and desktop-final were then presented together in a second comparison input after fixes. Source was not reviewed from memory.
- Focused region: full-resolution comparison made title, goal controls, task rows and CTA readable; no separately cropped comparison was used. Exact pixel typography remains follow-up, not claimed as proven.
- Mobile: 390 × 844 CSS viewport, scroll width 375 (scrollbar), viewport screenshot `outputs/design-qa/mobile-task-v2.png`. Older `mobile.png` full-page capture shows stitching artifacts and is not used as final visual truth.
- Comparison history: initial desktop-v1 captured while viewport override was settling and is excluded for geometry decisions. desktop-v2 confirmed two-column composition and repaired paragraph contrast. Mobile initial capture identified retained scroll position; mobile-task-v2 confirmed top-of-task after correction. desktop-final confirms no regression in default state.

## Required fidelity surfaces

- Typography: serif display / sans-serif body; desktop title 46 px maximum, mobile 29 px. Long task descriptions capped visually to preserve scanning; full task remains accessible when opened. System font fallback is retained, not downloaded from proprietary font files.
- Spacing: 56.5 / 43.5 split, 78 px header, 58 px left inset, 30 px plan inset, responsive single column below 760 px. Primary controls are not hidden by horizontal overflow; long content scrolls vertically.
- Colors: navy background, lighter plan surface, blue action and muted slate text; nature green and humanities paper palettes verified with selector. Fixed inherited paragraph color issue.
- Imagery: generated raster backdrop and black-hole / technology / nature banners used, no CSS illustration substitutes. Humanities and studio intentionally use typographic layouts without a banner. Space assets preserve subject and art direction, not exact star positions.
- Icons: existing Lucide outline compass, orbit, book, pencil and send icons match the reference's thin-stroke controls. No bespoke SVG artwork or icon-as-illustration placeholders were added.
- Copy: arbitrary input, editable plan, simulation warning, source limitations and self-assessment labels are explicit. No learning mastery or real-world efficacy claim. Theme changes select prepared visual systems, not real-time image generation.

## Functional checks

- Browser verified: arbitrary text input; request pending; request failure retains text and example; goal editing; moving task down; adding and removing task; starting selected order; evidence notes; answer entry; self-assessment checkbox; save; export action; history navigation; reload and restore modified goal/task order; natural and humanities theme selectors; mobile start scroll reset.
- Browser console: no errors reported by tab.dev.logs at final check.
- Automated: 16 tests pass (6 new expedition tests plus 10 existing practice/progress tests). TypeScript noEmit passes. Targeted lint for changed app / API / expedition files passes. Production build passes (before final scroll-only effect; final source typechecked afterward).
- Whole-repository lint has pre-existing errors in unused generated UI primitives; they are not silently reported as passing.
- Not verified: live success after rate limit, live feedback UI with actual model response, deployed API behavior, external-device public access, export file contents via browser download capture. Unit tests use deterministic provider stubs and do not prove model quality.

## Implementation checklist

1. When official service is available, rerun one unrelated topic in the browser and confirm its theme, actual material and source links.
2. Submit specific teaching, inspect exact quote + before/after behavior, then test a vague answer without fabricated improvement.
3. Capture a successful live session and update this report; only then mark the end-to-end build accepted.
4. Publish only after an explicit user request. Existing private deployment has not been overwritten.

## 继续自测补充（2026-09-09，本轮）

1. 草稿与任务编辑 — 通过。上一轮已修复刷新丢失、编辑器全部展开、材料不可编辑和空任务可进入等问题。本轮恢复此前测试草稿，确认回答、笔记和第三个自选任务仍在。
2. 手机端实践 — 通过所测范围。390 × 844 下内容宽 375，没有横向溢出；任务材料与输入框可读。截图 `outputs/self-test/06-mobile-task.png` 已保存并打开检查。不据此声称完整无障碍合规。
3. 改变目标后的结果有效性 — 已修复并实测。先勾选自评完成，再修改目标，完成数从 1/3 回到 0/3，回答与笔记保持。目标/场景和任务修改统一丢弃旧反馈、旧提交和旧对话。修改标题不重置学习结果。新自动化用例检查保留写作、清除评估、不修改原对象。
4. 导出 — 完整内容可读取、可全选复制。内置浏览器等待下载事件超时，不能确认文件实际落盘；因此新增只读导出快照作为后备路径，提示改为“已发起下载”而非“已导出”。截图 `outputs/self-test/07-export-preview.png` 已打开检查，文本包含目标、材料、要求、自检标准、笔记、回答和来源声明。反馈完整性由单元测试覆盖；真实反馈仍未产生。
5. 真实自由话题 — 阻塞。再次提交“如何读懂印象派绘画？”及色彩/笔触目标，收到知乎限流；旧计划、编辑内容和新话题输入完整保留。截图 `outputs/self-test/08-live-rate-limit.png` 是当前错误状态局部视口证据，非首页布局验收图。没有用示例冒充成功。

最新检查：30 项自动化测试通过；TypeScript noEmit 通过；本轮变更文件定向 lint 通过；包含导出后备路径的生产构建通过。浏览器未捕获 console error。

边界：本轮没有重做完整视觉稿对照，不覆盖上文视觉偏差；未确认下载文件落盘、实际取消上游进程、真实生成成功和真实带教反馈、线上部署。当前仍为本地版本。原线上站点未改动。

## 请求边界补验（2026-09-09，后续轮次）

- 生产 API 原本调用 request.text() 后再检查大小；改为流式读取时累计字节，超过 256000 字节立即取消输入流，不依赖 Content-Length。
- 新增 4 项确定性测试：中文 UTF-8 按单字节跨块；超长流取消且不继续读取；等待输入时取消可及时结束；截断 UTF-8 返回 400。
- 当前全部 34 项测试、类型检查和本轮文件定向 lint 通过。这些测试证明请求体读取层行为，不等于实际知乎 CLI 子进程取消或远端生成取消。
- 查阅已安装知乎 Skill：配额/频率限制时应停止重复请求。因此未继续调用真实生成。核心端到端验收仍等待服务恢复；不以模拟 provider 或其他模型替代比赛接口来宣称通过。

final result: blocked
