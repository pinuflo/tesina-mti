import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { VersionService, VersionType } from './services/version.service';
import { ScenarioWizardComponent } from './components/scenario-wizard/scenario-wizard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ScenarioWizardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'sistema-nutricional';
  currentVersion: VersionType = 'sin-ia';
  isAIEnabled = false;
  scenarioActive = false;

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

  onScenarioChange(active: boolean) {
    this.scenarioActive = active;
  }
}
