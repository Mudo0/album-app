import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-image-uploader',
  imports: [],
  template: ` <p>image-uploader works!</p> `,
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageUploader {}
