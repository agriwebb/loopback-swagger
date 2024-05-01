export declare function generateRemoteMethods(
  spec?: any,
  options?: any
): string;

export declare function generateCode(
  version: string | number,
  modelName: string,
  operations: any[]
): string;

export declare function generateModels(spec?: any, options?: any): any;

export declare function getGenerator(spec?: any): any;

export declare function generateSwaggerSpec(
  loopbackApplication: any,
  options?: any
): any;
