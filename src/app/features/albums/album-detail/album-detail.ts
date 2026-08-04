import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-album-detail',
  imports: [],
  template: ` <p>album-detail works!</p> `,
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumDetail {}
