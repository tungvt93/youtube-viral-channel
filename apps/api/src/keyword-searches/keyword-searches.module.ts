import { Module } from "@nestjs/common";
import { KeywordSearchesController } from "./keyword-searches.controller";
import { KeywordSearchesService } from "./keyword-searches.service";

@Module({
  controllers: [KeywordSearchesController],
  providers: [KeywordSearchesService],
})
export class KeywordSearchesModule {}
