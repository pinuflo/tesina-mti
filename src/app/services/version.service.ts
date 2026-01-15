import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type VersionType = 'sin-ia' | 'con-ia';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private versionSubject = new BehaviorSubject<VersionType>('sin-ia');
  public version$ = this.versionSubject.asObservable();

  constructor() {
    // Recuperar la versión guardada del localStorage
    const savedVersion = localStorage.getItem('app-version') as VersionType;
    if (savedVersion) {
      this.versionSubject.next(savedVersion);
    }
  }

  getCurrentVersion(): VersionType {
    return this.versionSubject.value;
  }

  setVersion(version: VersionType): void {
    this.versionSubject.next(version);
    localStorage.setItem('app-version', version);
  }

  isAIEnabled(): boolean {
    return this.getCurrentVersion() === 'con-ia';
  }
}
