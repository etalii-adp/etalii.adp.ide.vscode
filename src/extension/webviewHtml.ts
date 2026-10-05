import * as vscode from 'vscode';

function nonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let index = 0; index < 32; index++) text += alphabet[Math.floor(Math.random() * alphabet.length)];
  return text;
}

/**
 * The page of one webview: its one script and one stylesheet, under a content security policy that
 * allows those two and nothing remote.
 */
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, bundle: string, title: string): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', `${bundle}.js`));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', `${bundle}.css`));
  const token = nonce();
  const policy = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${token}'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${style}" rel="stylesheet">
<title>${title}</title>
</head>
<body>
<script nonce="${token}" src="${script}"></script>
</body>
</html>`;
}