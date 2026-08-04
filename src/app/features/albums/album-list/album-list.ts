import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-album-list',
  imports: [],
  template: ` <p>album-list works!</p> `,
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumList {}
