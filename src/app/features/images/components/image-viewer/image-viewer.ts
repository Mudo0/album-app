import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-image-viewer',
  imports: [],
  template: ` <p>image-viewer works!</p> `,
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageViewer {}
