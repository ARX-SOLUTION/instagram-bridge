import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: number) {
    return this.usersService.findById(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.usersService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() data: any) {
    return this.usersService.update(id, data);
  }

  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.usersService.delete(id);
  }
}