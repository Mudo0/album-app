import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-photo-grid',
  imports: [],
  template: ` <p>photo-grid works!</p> `,
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoGrid {}
