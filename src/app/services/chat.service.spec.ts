import { TestBed } from '@angular/core/testing';

import { ChatService } from './chat.service';
import { HTTP_SERVICE_TEST_IMPORTS } from 'src/testing/shallow-test-setup';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: HTTP_SERVICE_TEST_IMPORTS
    });
    service = TestBed.inject(ChatService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
