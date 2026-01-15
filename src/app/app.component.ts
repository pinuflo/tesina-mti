import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { VersionService, VersionType } from './services/version.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'sistema-nutricional';
  currentVersion: VersionType = 'sin-ia';
  isAIEnabled = false;

  constructor(private versionService: VersionService) {}

  ngOnInit() {
    this.versionService.version$.subscribe(version => {
      this.currentVersion = version;
      this.isAIEnabled = this.versionService.isAIEnabled();
    });
  }

  onVersionChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const version = target.value as VersionType;
    this.versionService.setVersion(version);
  }
}
