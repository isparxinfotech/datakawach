import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('AppComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: SHALLOW_COMPONENT_TEST_IMPORTS,
    declarations: [AppComponent],
    schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
  }));

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'HRKUI'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('HRKUI');
  });

  it('should render the shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-chat')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
