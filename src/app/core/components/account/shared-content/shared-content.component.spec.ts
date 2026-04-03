import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SharedContentComponent } from './shared-content.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('SharedContentComponent', () => {
  let component: SharedContentComponent;
  let fixture: ComponentFixture<SharedContentComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SharedContentComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(SharedContentComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
