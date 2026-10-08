export const styles = `
:root { color-scheme: light; --ink: #253834; --muted: #5d6965; --accent: #155b4b; --line: #dbdfd6; --paper: #fffefb; }
* { box-sizing: border-box; }
body { margin: 0; background: #f4f3ed; color: var(--ink); font: 16px/1.55 system-ui, -apple-system, sans-serif; }
a { color: var(--accent); text-underline-offset: .2em; }
a:hover { color: #0a3e31; }
:focus-visible { outline: 3px solid #b06921; outline-offset: 4px; }
header { max-width: 1120px; margin: auto; padding: 28px 32px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid var(--line); }
.brand { font-weight: 750; font-size: 21px; text-decoration: none; display: flex; align-items: center; gap: 14px; color: var(--ink); }
.badge { font-size: 10px; font-weight: 650; letter-spacing: .08em; border: 1px solid var(--line); padding: 4px 8px; border-radius: 5px; color: var(--muted); }
nav { display: flex; gap: 8px; flex-wrap: wrap; }
nav a { padding: 10px 12px; min-height: 44px; text-decoration: none; border-radius: 6px; font-size: 14px; }
nav a:hover { background: #e6eae1; }
main { max-width: 832px; margin: 48px auto 64px; padding: 0 32px; }
h1 { font-family: Georgia, serif; font-size: clamp(30px, 5vw, 42px); font-weight: 500; letter-spacing: -.03em; line-height: 1.2; margin: 8px 0 12px; overflow-wrap: anywhere; }
h2 { font-size: 20px; font-weight: 650; margin: 0 0 12px; overflow-wrap: anywhere; }
p { margin: 0 0 16px; }
.eyebrow { color: var(--accent); font-size: 11px; font-weight: 750; letter-spacing: .13em; margin-bottom: 12px; }
.lede { color: var(--muted); margin-bottom: 28px; }
.card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 30px; box-shadow: 0 4px 16px #25383404; }
label { display: block; margin-bottom: 18px; font-size: 14px; font-weight: 600; }
input, select, textarea { display: block; width: 100%; margin-top: 7px; border: 1px solid #b5c0b9; border-radius: 7px; padding: 12px 14px; background: #fff; color: var(--ink); font: 16px/1.4 system-ui, sans-serif; min-height: 48px; }
textarea { resize: vertical; }
input::placeholder { color: #75817b; }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
.grid label { margin-bottom: 8px; }
.hint { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
details { border-top: 1px solid var(--line); padding-top: 16px; margin: 24px 0; }
summary { cursor: pointer; min-height: 44px; font-weight: 600; font-size: 14px; }
button, .button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border: 1px solid #bdc6be; border-radius: 7px; background: #edf0e8; color: var(--ink); padding: 10px 18px; font: 600 14px/1.5 system-ui, sans-serif; cursor: pointer; text-decoration: none; }
button:hover, .button:hover { background: #dfe7db; }
.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.primary:hover { background: #0a4536; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin: 20px 0 16px; }
.actions form { margin: 0; }
.actions > a:not(.button) { font-size: 14px; min-height: 44px; display: inline-flex; align-items: center; }
.amount { font-size: clamp(26px, 5vw, 36px); font-weight: 600; letter-spacing: -.035em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; margin-bottom: 12px; }
dl { margin: 24px 0; font-size: 14px; }
dl div { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 16px; padding: 9px 0; border-bottom: 1px solid #ebede6; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.notice { background: #ebefe6; border-left: 3px solid #92a887; border-radius: 4px; padding: 12px 16px; font-size: 13px; margin: 20px 0; }
.history { list-style: none; margin: 0; padding: 0; }
.history-row { display: flex; justify-content: space-between; gap: 20px; padding: 18px 0; border-bottom: 1px solid var(--line); }
.history-row:first-child { padding-top: 0; }
.history-row a { font-weight: 600; overflow-wrap: anywhere; }
.history-row p { margin: 5px 0 0; }
.history-row strong { font-variant-numeric: tabular-nums; white-space: nowrap; }
.void { color: var(--muted); }
.totals { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); }
.error { background: #fbeddf; border: 1px solid #b46d32; padding: 18px 22px; border-radius: 8px; margin-bottom: 24px; }
.error h2 { font-size: 17px; }
.error p { margin: 0; }
footer { max-width: 1120px; border-top: 1px solid var(--line); margin: 0 auto; padding: 24px 32px; color: var(--muted); font-size: 12px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 16px; top: 12px; background: white; padding: 12px; z-index: 10; }
@media (max-width: 640px) {
  header { padding: 20px; align-items: flex-start; flex-direction: column; gap: 12px; }
  .brand { flex-wrap: wrap; font-size: 19px; }
  nav { gap: 0; }
  nav a { padding: 10px 12px 10px 0; margin-right: 14px; }
  main { padding: 0 20px; margin: 28px auto 40px; }
  .card { padding: 22px 20px; }
  .grid { grid-template-columns: 1fr; gap: 10px; }
  dl div { grid-template-columns: 1fr; gap: 2px; }
  .history-row { flex-direction: column; gap: 8px; }
  footer { padding: 20px; }
}
`;
