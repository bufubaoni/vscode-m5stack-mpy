import * as vscode from 'vscode';
import { M5FSResource, M5TreeDataProvider } from './TreeDataProvider';
import { PickedItem } from './types';
class FileTree {
  private readonly tree: vscode.TreeView<M5FSResource>;
  constructor(items: PickedItem[]) {
    this.tree = vscode.window.createTreeView('m5stackv2', {
      treeDataProvider: new M5TreeDataProvider(items.map((item) => item.label)),
    });
  }
}

export default FileTree;
