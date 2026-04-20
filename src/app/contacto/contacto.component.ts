import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contacto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contacto.component.html',
  styleUrl: './contacto.component.scss'
})
export class ContactoComponent {
  form = { nombre: '', email: '', asunto: '', mensaje: '' };
  submitted = false;
  sent = false;

  isValid(): boolean {
    return this.form.nombre.trim() !== ''
      && this.form.email.trim() !== ''
      && this.form.mensaje.trim() !== '';
  }

  enviar() {
    this.submitted = true;
    if (this.isValid()) {
      this.sent = true;
    }
  }

  resetForm() {
    this.form = { nombre: '', email: '', asunto: '', mensaje: '' };
    this.submitted = false;
    this.sent = false;
  }
}
