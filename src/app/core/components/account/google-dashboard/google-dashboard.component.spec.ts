import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GoogleDashboardComponent } from './google-dashboard.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('GoogleDashboardComponent', () => {
  let component: GoogleDashboardComponent;
  let fixture: ComponentFixture<GoogleDashboardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [GoogleDashboardComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(GoogleDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
