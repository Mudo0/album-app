import { Component, inject, input, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlbumService } from '../../services/album.service';
import { NavigationService } from '../../../../core/services/navigation.service';
import { BackButton } from '../../../../shared/components/back-button/back-button';
import type { Album } from '../../../../core/models/album.model';

@Component({
  selector: 'app-album-form',
  standalone: true,
  imports: [FormsModule, BackButton],
  templateUrl: './album-form.html',
  styleUrl: './album-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumForm implements OnInit {
  private readonly albumService = inject(AlbumService);
  private readonly navigation = inject(NavigationService);

  /** Si se provee, estamos en modo edición */
  readonly id = input<string>();

  readonly name = signal('');
  readonly saving = signal(false);
  readonly loading = signal(false);

  private album?: Album;

  get isEditing(): boolean {
    return !!this.id();
  }

  async ngOnInit(): Promise<void> {
    const albumId = this.id();
    if (!albumId) return;

    this.loading.set(true);
    const album = await this.albumService.getById(albumId);
    if (album) {
      this.album = album;
      this.name.set(album.name);
    } else {
      // Si el álbum no existe, sacamos al usuario para evitar inconsistencias
      this.navigation.back();
    }
    this.loading.set(false);
  }

  async save(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed || this.saving()) return;

    this.saving.set(true);

    const albumId = this.id();
    if (albumId) {
      // Edición sin álbum cargado: no persistir nada
      if (!this.album) return;

      await this.albumService.updateName(this.album, trimmed);
      // Pantalla transitiva: el back la resuelve por la jerarquía (/albums)
      this.navigation.back();
    } else {
      const album = await this.albumService.create({ name: trimmed });
      // Reemplaza el form en el historial: el detail queda como pantalla estática
      this.navigation.toAlbumDetail(album.id);
    }
  }
}
