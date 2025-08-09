import { Controller, Get, Param } from '@nestjs/common';
import { BoardServiceSettingsService } from './service-settings.service';

@Controller('boards')
export class BoardServiceSettingsController {
  constructor(private readonly svc: BoardServiceSettingsService) {}

  @Get(':id/services')
  async list(@Param('id') id: string) {
    const items = await this.svc.list(id);
    return items.map((i) => ({ serviceKey: i.serviceKey, config: i.config }));
  }

  @Get(':id/services/:key')
  async getOne(@Param('id') id: string, @Param('key') key: string) {
    const item = await this.svc.get(id, key);
    return item ? { serviceKey: item.serviceKey, config: item.config } : null;
  }
}


