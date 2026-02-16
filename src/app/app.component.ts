import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ScenarioWizardComponent } from './components/scenario-wizard/scenario-wizard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ScenarioWizardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'sistema-nutricional';
  scenarioActive = false;

  onScenarioChange(active: boolean) {
    this.scenarioActive = active;
  }
}
