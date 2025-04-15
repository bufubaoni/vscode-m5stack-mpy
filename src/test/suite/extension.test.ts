import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('should have the extension active', async () => {
    const extension = await vscode.extensions.getExtension('bufubaoni.vscode-m5stack-mpy-uiflow2');

    assert.strictEqual(extension?.isActive, true);
  });
});
