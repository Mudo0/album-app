import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlbumService } from '../../../core/services/album.service';
import { BackButton } from '../../../shared/components/back-button/back-button';

@Component({
  selector: 'app-album-form',
  standalone: true,
  imports: [FormsModule, BackButton],
  templateUrl: './album-form.html',
  styleUrl: './album-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumForm {
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);

  readonly name = signal('');
  readonly saving = signal(false);

  async save(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed || this.saving()) return;

    this.saving.set(true);
    await this.albumService.create({ name: trimmed });
    this.router.navigate(['/albums']);
  }
}
