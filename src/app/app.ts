import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateDialog } from './features/updates/update-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UpdateDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
