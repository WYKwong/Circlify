import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AvailableServicesService } from './services.service';

@Controller('services')
export class AvailableServicesController {
  constructor(private readonly service: AvailableServicesService) {}

  // Public listing for board creation UI
  @Get()
  async list() {
    const services = await this.service.listAll();
    return services.map(s => ({
      serviceType: s.serviceType,
      displayName: s.displayName,
      description: s.description,
      haveQuestion: !!s.haveQuestion,
      question: s.question || '',
    }));
  }
}


