import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NavigationService } from '../../../core/services/navigation.service';

@Component({
  selector: 'app-back-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="back" (click)="goBack()" aria-label="Volver">
      ←
    </button>
  `,
  styles: `
    .back {
      width: 36px;
      height: 36px;
      border: none;
      background: none;
      font-size: 1.25rem;
      cursor: pointer;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4f46e5;
    }

    .back:active {
      background: #f4f4f5;
    }
  `,
})
export class BackButton {
  private readonly navigation = inject(NavigationService);

  protected goBack(): void {
    this.navigation.back();
  }
}
