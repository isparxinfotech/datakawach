import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataAiComponent } from './data-ai.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('DataAiComponent', () => {
  let component: DataAiComponent;
  let fixture: ComponentFixture<DataAiComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DataAiComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(DataAiComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
