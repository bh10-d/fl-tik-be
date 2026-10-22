import {
  Injectable,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

  /**
   * Seed default platform admin account if no user exists in the database
   */
  private async ensureDefaultAdmin() {
    try {
      const defaultEmail = 'admin@liambui.com';
      const defaultPassword = 'HoThAo@123';
      const user = await this.prisma.user.findUnique({
        where: { email: defaultEmail },
      });

      if (!user) {
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        await this.prisma.user.create({
          data: {
            email: defaultEmail,
            name: 'Liam Bui (Admin)',
            passwordHash: hashedPassword,
            role: 'ADMIN',
          },
        });
        this.logger.log(`Initialized admin account: ${defaultEmail}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not seed default admin user: ${err.message}`);
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const cleanEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    return user;
  }
}

