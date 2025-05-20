import { Routes } from '@angular/router';
import { InicioComponent } from './inicio/inicio.component';
import { PacientesComponent } from './pacientes/pacientes.component';
import { EvaluacionComponent } from './evaluacion/evaluacion.component';
import { AnalisisComponent } from './analisis/analisis.component';
import { SeguimientoComponent } from './seguimiento/seguimiento.component';
import { ContactoComponent } from './contacto/contacto.component';

export const routes: Routes = [
  { path: '', component: InicioComponent },
  { path: 'pacientes', component: PacientesComponent },
  { path: 'evaluacion', component: EvaluacionComponent },
  { path: 'analisis', component: AnalisisComponent },
  { path: 'seguimiento', component: SeguimientoComponent },
  { path: 'contacto', component: ContactoComponent },
  { path: '**', redirectTo: '' }
];
