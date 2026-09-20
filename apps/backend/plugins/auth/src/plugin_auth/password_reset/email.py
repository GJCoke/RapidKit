"""Password-reset email rendering."""

import html


def render_password_reset_email(platform_name: str, user_name: str, reset_link: str) -> tuple[str, str]:
    """Render a safe Chinese password-reset HTML message."""
    safe_platform_name = html.escape(platform_name)
    safe_name = html.escape(user_name)
    safe_link = html.escape(reset_link, quote=True)
    subject = f"【{platform_name}】重置登录密码"
    body = f"""<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f3f5f9;color:#1f2937;font-family:Arial,'Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);">
          <tr><td style="background:#4361ee;padding:28px 36px;color:#ffffff;">
            <div style="font-size:14px;opacity:.9;">{safe_platform_name}</div>
            <div style="font-size:24px;font-weight:700;margin-top:6px;">重置登录密码</div>
          </td></tr>
          <tr><td style="padding:32px 36px;line-height:1.75;">
            <p style="margin:0 0 16px;">您好，{safe_name}：</p>
            <p style="margin:0 0 20px;">我们收到了您在 {safe_platform_name} 的密码重置请求，请点击下方按钮设置新密码。</p>
            <p style="text-align:center;margin:28px 0;"><a href="{safe_link}" style="display:inline-block;background:#4361ee;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 32px;border-radius:8px;">重置密码</a></p>
            <div style="background:#fff7ed;color:#9a3412;border-radius:6px;padding:14px 16px;font-size:14px;">链接按系统配置的有效期生效且仅可使用一次，请勿转发给他人。</div>
            <div style="background:#fef2f2;color:#991b1b;border-left:4px solid #ef4444;border-radius:6px;padding:14px 16px;margin-top:16px;font-size:14px;">若非本人操作，请忽略本邮件且无需点击链接。</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""
    return subject, body
