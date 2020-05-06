import { readFileSync } from "fs";
import { join } from "path";

import { ComponentsObject, OpenAPIObject, OperationObject, ResponseObject } from "openapi3-ts";

import importOpenApi, {
  generateResponsesDefinition,
  generateRestfulComponent,
  generateSchemasDefinition,
  getArray,
  getObject,
  getParamsInPath,
  getRef,
  getResReqTypes,
  getScalar,
  isReference,
  reactPropsValueToObjectValue,
  resolveDiscriminator,
} from "../import-open-api";

describe("scripts/import-open-api", () => {
  it("should parse correctly petstore-expanded.yaml", async () => {
    const input = readFileSync(join(__dirname, "./petstore-expanded.yaml"), "utf-8");
    const data = await importOpenApi({ data: input, format: "yaml" });
    expect(data).toMatchSnapshot();
  });

  describe("isReference", () => {
    it("should return true if the property is a ref", () => {
      const property = {
        $ref: "#/components/schemas/FieldResponse",
      };
      expect(isReference(property)).toBe(true);
    });
    it("should return false if the property is not a ref", () => {
      const property = {
        type: "string",
      };
      expect(isReference(property)).toBe(false);
    });
  });

  describe("getParamsInPath", () => {
    it("should return all params in the path", () => {
      expect(getParamsInPath("/pet/{category}/{name}/")).toEqual(["category", "name"]);
    });
  });

  describe("getScalar", () => {
    [
      { item: { type: "integer" }, expected: "number" },
      { item: { type: "long" }, expected: "number" },
      { item: { type: "int32" }, expected: "number" },
      { item: { type: "int64" }, expected: "number" },
      { item: { type: "float" }, expected: "number" },
      { item: { type: "number" }, expected: "number" },
      { item: { type: "double" }, expected: "number" },
      { item: { type: "boolean" }, expected: "boolean" },
      { item: { type: "array", items: { type: "string" } }, expected: "string[]" },
      { item: { type: "array", items: { type: "integer" } }, expected: "number[]" },
      { item: { type: "array", items: { type: "customType" } }, expected: "any[]" },
      { item: { type: "object", properties: { value: { type: "integer" } } }, expected: "{\n  value?: number;\n}" },
      { item: { type: "object" }, expected: "{[key: string]: any}" },
      { item: { type: "object", $ref: "#/components/schemas/Foo" }, expected: "Foo" },
      { item: { type: "string" }, expected: "string" },
      { item: { type: "byte" }, expected: "string" },
      { item: { type: "binary" }, expected: "string" },
      { item: { type: "date" }, expected: "string" },
      { item: { type: "dateTime" }, expected: "string" },
      { item: { type: "date-time" }, expected: "string" },
      { item: { type: "password" }, expected: "string" },
      { item: { type: "string", enum: ["foo", "bar"] }, expected: `"foo" | "bar"` },
      { item: { type: "customType" }, expected: "any" },
      { item: { type: "integer", nullable: true }, expected: "number | null" },
      { item: { type: "boolean", nullable: true }, expected: "boolean | null" },
      { item: { type: "string", nullable: true }, expected: "string | null" },
      { item: { type: "object", nullable: true }, expected: "{[key: string]: any} | null" },
      { item: { type: "object", $ref: "#/components/schemas/Foo", nullable: true }, expected: "Foo | null" },
    ].map(({ item, expected }) =>
      it(`should return ${expected} as type for ${item.type}`, () => {
        expect(getScalar(item)).toEqual(expected);
      }),
    );
  });

  describe("getRef", () => {
    it("should return the name from `#/components/schemas`", () => {
      expect(getRef("#/components/schemas/foo")).toEqual("Foo");
    });
    it("should return the name from `#/components/responses`", () => {
      expect(getRef("#/components/responses/foo")).toEqual("FooResponse");
    });
    it("should return the name from `#/components/parameters`", () => {
      expect(getRef("#/components/parameters/foo")).toEqual("FooParameter");
    });
    it("should return the name from `#/components/requestBodies`", () => {
      expect(getRef("#/components/requestBodies/foo")).toEqual("FooRequestBody");
    });
    it("should throw if the ref is not in `#/components/schemas`", () => {
      expect(() => getRef("#/somewhere/schemas/foo")).toThrowError(
        "This library only resolve $ref that are include into `#/components/*` for now",
      );
    });
  });

  describe("getArray", () => {
    it("should return an array of number", () => {
      const item = {
        type: "array",
        items: {
          type: "integer",
        },
      };

      expect(getArray(item)).toEqual("number[]");
    });

    it("should return an array of ref", () => {
      const item = {
        type: "array",
        items: {
          $ref: "#/components/schemas/foo",
        },
      };

      expect(getArray(item)).toEqual("Foo[]");
    });
    it("should return an array of oneOf", () => {
      const item = {
        items: {
          oneOf: [
            {
              type: "boolean",
            },
            {
              type: "number",
            },
            {
              type: "string",
            },
          ],
          title: "Result field",
        },
        title: "Result row",
        type: "array",
      };
      expect(getArray(item)).toEqual("(boolean | number | string)[]");
    });
    it("should return an array of allOf", () => {
      const item = {
        items: {
          allOf: [
            {
              $ref: "#/components/schemas/foo",
            },
            {
              $ref: "#/components/schemas/bar",
            },
            {
              $ref: "#/components/schemas/baz",
            },
          ],
        },
        type: "array",
      };
      expect(getArray(item)).toEqual("(Foo & Bar & Baz)[]");
    });
  });

  describe("getObject", () => {
    it("should return the type of a standard object", () => {
      const item = {
        type: "object",
        required: ["name", "age"],
        properties: {
          name: {
            type: "string",
          },
          age: {
            type: "integer",
          },
        },
      };
      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "{
                                                                  name: string;
                                                                  age: number;
                                                                }"
                                                `);
    });

    it("should return the type of an object with optional values", () => {
      const item = {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
          },
          age: {
            type: "integer",
          },
        },
      };
      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "{
                                                                  name: string;
                                                                  age?: number;
                                                                }"
                                                `);
    });

    it("should deal with additionalProperties", () => {
      const item = {
        type: "object",
        additionalProperties: {
          type: "string",
        },
      };
      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "{
                                                                  [key: string]: string;
                                                                }"
                                                `);
    });

    it("should deal with ref additionalProperties", () => {
      const item = {
        type: "object",
        additionalProperties: {
          $ref: "#/components/schemas/foo",
        },
      };
      expect(getObject(item)).toMatchInlineSnapshot(`
                                                        "{
                                                          [key: string]: Foo;
                                                        }"
                                          `);
    });

    it("should deal with true as additionalProperties", () => {
      const item = {
        type: "object",
        additionalProperties: true,
      };
      expect(getObject(item)).toMatchInlineSnapshot(`"{[key: string]: any}"`);
    });

    it("should deal with ref additionalProperties", () => {
      const item = {
        type: "object",
        additionalProperties: {
          $ref: "#/components/schemas/foo",
        },
      };
      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "{
                                                                  [key: string]: Foo;
                                                                }"
                                                `);
    });

    it("should deal with oneOf additionalProperties", () => {
      const item = {
        type: "object",
        additionalProperties: {
          oneOf: [{ $ref: "#/components/schemas/foo" }, { $ref: "#/components/schemas/bar" }],
        },
      };
      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "{
                                                                  [key: string]: Foo | Bar;
                                                                }"
                                                `);
    });

    it("should deal with array as additionalProperties", () => {
      const item = {
        type: "object",
        additionalProperties: {
          type: "array",
          items: {
            type: "string",
          },
        },
      };

      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "{
                                                                  [key: string]: string[];
                                                                }"
                                                `);
    });

    it("should deal with additionalProperties on top of define properties", () => {
      const item = {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
        },
        additionalProperties: true,
      };

      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "{
                                                                  name?: string;
                                                                  [key: string]: any;
                                                                }"
                                                `);
    });

    it("should deal with allOf", () => {
      const item = {
        type: "object",
        allOf: [
          { $ref: "#/components/schemas/foo" },
          {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
            },
          },
        ],
      };
      expect(getObject(item)).toMatchInlineSnapshot(`
                                                                "Foo & {
                                                                  name: string;
                                                                }"
                                                `);
    });
    it("should handle empty properties (1)", () => {
      const item = {
        properties: {},
      };
      expect(getObject(item)).toMatchInlineSnapshot(`"{}"`);
    });
    it("should handle empty properties (2)", () => {
      const item = {};
      expect(getObject(item)).toMatchInlineSnapshot(`"{}"`);
    });
    it("should handle free form object (1)", () => {
      const item = {
        type: "object",
      };
      expect(getObject(item)).toMatchInlineSnapshot(`"{[key: string]: any}"`);
    });
    it("should handle free form object (2)", () => {
      const item = {
        type: "object",
        additionalProperties: true,
      };
      expect(getObject(item)).toMatchInlineSnapshot(`"{[key: string]: any}"`);
    });
    it("should handle free form object (3)", () => {
      const item = {
        type: "object",
        additionalProperties: {},
      };
      expect(getObject(item)).toMatchInlineSnapshot(`"{[key: string]: any}"`);
    });
  });

  describe("resolveDiscriminator", () => {
    it("should propagate any discrimator value as enum", () => {
      const specs: OpenAPIObject = {
        openapi: "3.0.0",
        info: {
          title: "Test",
          description: "Test",
          version: "0.0.1",
          contact: {
            name: "Fabien Bernard",
            url: "https://fabien0102.com",
            email: "fabien@contiamo.com",
          },
        },
        paths: {},
        components: {
          schemas: {
            Error: {
              oneOf: [{ $ref: "#/components/schemas/GeneralError" }, { $ref: "#/components/schemas/FieldError" }],
              discriminator: {
                propertyName: "type",
                mapping: {
                  GeneralError: "#/components/schemas/GeneralError",
                  FieldError: "#/components/schemas/FieldError",
                },
              },
            },
            GeneralError: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                },
                message: {
                  type: "string",
                },
              },
              required: ["type", "message"],
            },
            FieldError: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                },
                message: {
                  type: "string",
                },
                key: {
                  type: "string",
                },
              },
              required: ["type", "message", "key"],
            },
          },
        },
      };

      resolveDiscriminator(specs);

      expect(specs?.components?.schemas?.GeneralError).toEqual({
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["GeneralError"],
          },
          message: {
            type: "string",
          },
        },
        required: ["type", "message"],
      });

      expect(specs?.components?.schemas?.FieldError).toEqual({
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["FieldError"],
          },
          message: {
            type: "string",
          },
          key: {
            type: "string",
          },
        },
        required: ["type", "message", "key"],
      });
    });
  });

  describe("generateSchemasDefinition", () => {
    it("should declare an interface for simple object", () => {
      const schema = {
        NewPet: {
          required: ["name"],
          properties: {
            name: {
              type: "string",
            },
            tag: {
              type: "string",
            },
          },
        },
      };
      expect(generateSchemasDefinition(schema)).toMatchInlineSnapshot(`
                        "export interface NewPet {
                          name: string;
                          tag?: string;
                        }
                        "
                  `);
    });

    it("should declare an interface for simple object (nullable)", () => {
      const schema = {
        NewPet: {
          required: ["name"],
          nullable: true,
          properties: {
            name: {
              type: "string",
            },
            tag: {
              type: "string",
            },
          },
        },
      };
      expect(generateSchemasDefinition(schema)).toMatchInlineSnapshot(`
                        "export type NewPet = {
                          name: string;
                          tag?: string;
                        } | null;
                        "
                  `);
    });

    it("should declare a type for union object", () => {
      const schema = {
        Pet: {
          allOf: [
            { $ref: "#/components/schemas/NewPet" },
            { required: ["id"], properties: { id: { type: "integer", format: "int64" } } },
          ],
        },
      };
      expect(generateSchemasDefinition(schema)).toMatchInlineSnapshot(`
                        "export type Pet = NewPet & {
                          id: number;
                        };
                        "
                  `);
    });

    it("should declare a discriminate object", () => {
      const schema = {
        Pet: {
          oneOf: [
            { $ref: "#/components/schemas/NewPet" },
            { required: ["id"], properties: { id: { type: "integer", format: "int64" } } },
          ],
        },
      };
      expect(generateSchemasDefinition(schema)).toMatchInlineSnapshot(`
                        "export type Pet = NewPet | {
                          id: number;
                        };
                        "
                  `);
    });

    it("should declare a type for all others types", () => {
      const schema = {
        PetName: {
          type: "string",
        },
      };

      expect(generateSchemasDefinition(schema)).toContain(`export type PetName = string;`);
    });

    it("should declare a type for all others types (nullable)", () => {
      const schema = {
        PetName: {
          type: "string",
          nullable: true,
        },
      };

      expect(generateSchemasDefinition(schema)).toContain(`export type PetName = string | null;`);
    });

    it("should deal with aliases", () => {
      const schema = {
        Wolf: {
          $ref: "#/components/schemas/Dog",
        },
      };

      expect(generateSchemasDefinition(schema)).toContain(`export type Wolf = Dog;`);
    });
  });

  describe("generateResponsesDefinition", () => {
    it("should declare an interface for simple object", () => {
      const responses: ComponentsObject["responses"] = {
        JobRun: {
          description: "Job is starting",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  executionID: {
                    description: "ID of the job execution",
                    type: "string",
                  },
                },
              },
            },
          },
        },
      };

      expect(generateResponsesDefinition(responses)).toMatchInlineSnapshot(`
                                                                        "
                                                                        /**
                                                                         * Job is starting
                                                                         */
                                                                        export interface JobRunResponse {
                                                                          /**
                                                                           * ID of the job execution
                                                                           */
                                                                          executionID?: string;
                                                                        }
                                                                        "
                                                      `);
    });

    it("should give double quotes for special properties", () => {
      const responses: ComponentsObject["responses"] = {
        JobRun: {
          description: "Job is starting",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  "execution-id": {
                    description: "ID of the job execution",
                    type: "string",
                  },
                },
              },
            },
          },
        },
      };

      expect(generateResponsesDefinition(responses)).toMatchInlineSnapshot(`
                                                                        "
                                                                        /**
                                                                         * Job is starting
                                                                         */
                                                                        export interface JobRunResponse {
                                                                          /**
                                                                           * ID of the job execution
                                                                           */
                                                                          \\"execution-id\\"?: string;
                                                                        }
                                                                        "
                                                      `);
    });

    it("should declare a a type for composed object", () => {
      const responses: ComponentsObject["responses"] = {
        JobRun: {
          description: "Job is starting",
          content: {
            "application/json": {
              schema: {
                allOf: [
                  {
                    type: "object",
                    properties: {
                      executionID: {
                        description: "ID of the job execution",
                        type: "string",
                      },
                    },
                  },
                  { $ref: "#/components/schemas/ExecutionID" },
                ],
              },
            },
          },
        },
      };

      expect(generateResponsesDefinition(responses)).toMatchInlineSnapshot(`
                                                                        "
                                                                        /**
                                                                         * Job is starting
                                                                         */
                                                                        export type JobRunResponse = {
                                                                          /**
                                                                           * ID of the job execution
                                                                           */
                                                                          executionID?: string;
                                                                        } & ExecutionID;
                                                                        "
                                                      `);
    });

    it("should declare a a type for union object", () => {
      const responses: ComponentsObject["responses"] = {
        JobRun: {
          description: "Job is starting",
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    properties: {
                      executionID: {
                        description: "ID of the job execution",
                        type: "string",
                      },
                    },
                  },
                  { $ref: "#/components/schemas/ExecutionID" },
                ],
              },
            },
          },
        },
      };

      expect(generateResponsesDefinition(responses)).toMatchInlineSnapshot(`
                                                                        "
                                                                        /**
                                                                         * Job is starting
                                                                         */
                                                                        export type JobRunResponse = {
                                                                          /**
                                                                           * ID of the job execution
                                                                           */
                                                                          executionID?: string;
                                                                        } | ExecutionID;
                                                                        "
                                                      `);
    });
  });

  describe("getResponseTypes", () => {
    it("should return the type of application/json", () => {
      const responses: Array<[string, ResponseObject]> = [
        [
          "200",
          {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
        ],
      ];

      expect(getResReqTypes(responses)).toEqual("FieldListResponse");
    });

    it("should return the type of application/json;charset=utf-8", () => {
      const responses: Array<[string, ResponseObject]> = [
        [
          "200",
          {
            description: "An array of schema fields",
            content: {
              "application/json;charset=utf-8": { schema: { $ref: "#/components/schemas/FieldListResponse" } },
            },
          },
        ],
      ];

      expect(getResReqTypes(responses)).toEqual("FieldListResponse");
    });

    it("should return the type of application/octet-stream if we don't have application/json response", () => {
      const responses: Array<[string, ResponseObject]> = [
        [
          "200",
          {
            description: "An array of schema fields",
            content: { "application/octet-stream": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
        ],
      ];

      expect(getResReqTypes(responses)).toEqual("FieldListResponse");
    });

    it("should return a union if we have multi responses", () => {
      const responses: Array<[string, ResponseObject]> = [
        [
          "200",
          {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
        ],
        [
          "201",
          {
            description: "An array of schema fields",
            content: {
              "application/json": {
                schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
              },
            },
          },
        ],
      ];

      expect(getResReqTypes(responses)).toMatchInlineSnapshot(`
                                                        "FieldListResponse | {
                                                          id: string;
                                                        }"
                                          `);
    });

    it("should not generate type duplication", () => {
      const responses: Array<[string, ResponseObject]> = [
        [
          "200",
          {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
        ],
        [
          "201",
          {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
        ],
      ];

      expect(getResReqTypes(responses)).toEqual("FieldListResponse");
    });
  });

  describe("generateGetComponent", () => {
    it("should generate a fully typed component", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "get", "/fields", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "listFields",
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [],
            "paramsTypes": "",
            "route": "/fields",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "",
        }
      `);
    });

    it("should have a nice documentation with summary and description", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        description: "This is a longer description to describe my endpoint",
        operationId: "listFields",
        tags: ["schema"],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
        },
      };

      expect(generateRestfulComponent(operation, "get", "/fields", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         * 
         * This is a longer description to describe my endpoint
         */
        ",
            "errorTypes": "unknown",
            "headerParams": Array [],
            "operation": Object {
              "description": "This is a longer description to describe my endpoint",
              "operationId": "listFields",
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [],
            "paramsTypes": "",
            "route": "/fields",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "",
        }
      `);
    });

    it("should add a fallback if the error is not defined", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
        },
      };

      expect(generateRestfulComponent(operation, "get", "/fields", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "unknown",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "listFields",
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [],
            "paramsTypes": "",
            "route": "/fields",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "",
        }
      `);
    });

    it("should remove duplicate types", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
          "404": {
            description: "file not found or field is not a file type",
            content: { "application/json": { schema: { $ref: "#/components/schemas/APIError" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "get", "/fields", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "listFields",
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
                "404": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "file not found or field is not a file type",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [],
            "paramsTypes": "",
            "route": "/fields",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "",
        }
      `);
    });

    it("should deal with parameters in query", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        parameters: [
          {
            name: "tenantId",
            in: "query",
            required: true,
            description: "The id of the Contiamo tenant",
            schema: { type: "string" },
          },
          {
            name: "projectId",
            in: "query",
            description: "The id of the project",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
          "404": {
            description: "file not found or field is not a file type",
            content: { "application/json": { schema: { $ref: "#/components/schemas/APIError" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "get", "/fields", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "listFields",
              "parameters": Array [
                Object {
                  "description": "The id of the Contiamo tenant",
                  "in": "query",
                  "name": "tenantId",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
                Object {
                  "description": "The id of the project",
                  "in": "query",
                  "name": "projectId",
                  "schema": Object {
                    "type": "string",
                  },
                },
              ],
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
                "404": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "file not found or field is not a file type",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [],
            "paramsTypes": "",
            "route": "/fields",
            "typeNames": Object {
              "body": "any",
              "query": "ListFieldsQueryParams",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "
              export interface ListFieldsQueryParams {
                /**
           * The id of the Contiamo tenant
           */
          tenantId: string;
          /**
           * The id of the project
           */
          projectId?: string;
              }
            ",
        }
      `);
    });
    it("should deal with parameters in query (root level)", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
          "404": {
            description: "file not found or field is not a file type",
            content: { "application/json": { schema: { $ref: "#/components/schemas/APIError" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(
        generateRestfulComponent(
          operation,
          "get",
          "/fields",
          [],
          [
            {
              name: "tenantId",
              in: "query",
              required: true,
              description: "The id of the Contiamo tenant",
              schema: { type: "string" },
            },
            {
              name: "projectId",
              in: "query",
              description: "The id of the project",
              schema: { type: "string" },
            },
          ],
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "listFields",
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
                "404": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "file not found or field is not a file type",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [],
            "paramsTypes": "",
            "route": "/fields",
            "typeNames": Object {
              "body": "any",
              "query": "ListFieldsQueryParams",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "
              export interface ListFieldsQueryParams {
                /**
           * The id of the Contiamo tenant
           */
          tenantId: string;
          /**
           * The id of the project
           */
          projectId?: string;
              }
            ",
        }
      `);
    });

    it("should deal with parameters in path", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        parameters: [
          {
            name: "tenantId",
            in: "path",
            required: true,
            description: "The id of the Contiamo tenant",
            schema: { type: "string" },
          },
          {
            name: "id",
            required: true,
            in: "path",
            description: "The id of the project",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
          "404": {
            description: "file not found or field is not a file type",
            content: { "application/json": { schema: { $ref: "#/components/schemas/APIError" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "get", "/fields/{id}", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "listFields",
              "parameters": Array [
                Object {
                  "description": "The id of the Contiamo tenant",
                  "in": "path",
                  "name": "tenantId",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
                Object {
                  "description": "The id of the project",
                  "in": "path",
                  "name": "id",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
              ],
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
                "404": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "file not found or field is not a file type",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [
              "id",
            ],
            "paramsTypes": "id: string",
            "route": "/fields/\${id}",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "",
        }
      `);
    });

    it("should deal with parameters in path (root level)", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
          "404": {
            description: "file not found or field is not a file type",
            content: { "application/json": { schema: { $ref: "#/components/schemas/APIError" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(
        generateRestfulComponent(
          operation,
          "get",
          "/fields/{id}",
          [],
          [
            {
              name: "tenantId",
              in: "path",
              required: true,
              description: "The id of the Contiamo tenant",
              schema: { type: "string" },
            },
            {
              name: "id",
              required: true,
              in: "path",
              description: "The id of the project",
              schema: { type: "string" },
            },
          ],
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "listFields",
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
                "404": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "file not found or field is not a file type",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [
              "id",
            ],
            "paramsTypes": "id: string",
            "route": "/fields/\${id}",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "",
        }
      `);
    });

    it("should generate a Mutate type component", () => {
      const operation: OperationObject = {
        summary: "Update use case details",
        operationId: "updateUseCase",
        tags: ["use-case"],
        parameters: [
          {
            name: "tenantId",
            in: "path",
            required: true,
            description: "The id of the Contiamo tenant",
            schema: { type: "string" },
          },
          {
            name: "useCaseId",
            in: "path",
            required: true,
            description: "The id of the use case",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UseCaseInstance" } } },
        },
        responses: {
          "204": {
            description: "Use case updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UseCaseResponse" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "put", "/use-cases/{useCaseId}", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "UpdateUseCase",
            "description": "/**
         * Update use case details
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "updateUseCase",
              "parameters": Array [
                Object {
                  "description": "The id of the Contiamo tenant",
                  "in": "path",
                  "name": "tenantId",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
                Object {
                  "description": "The id of the use case",
                  "in": "path",
                  "name": "useCaseId",
                  "required": true,
                  "schema": Object {
                    "format": "uuid",
                    "type": "string",
                  },
                },
              ],
              "requestBody": Object {
                "content": Object {
                  "application/json": Object {
                    "schema": Object {
                      "$ref": "#/components/schemas/UseCaseInstance",
                    },
                  },
                },
                "required": true,
              },
              "responses": Object {
                "204": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/UseCaseResponse",
                      },
                    },
                  },
                  "description": "Use case updated",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "Update use case details",
              "tags": Array [
                "use-case",
              ],
            },
            "paramsInPath": Array [
              "useCaseId",
            ],
            "paramsTypes": "useCaseId: string",
            "route": "/use-cases/\${useCaseId}",
            "typeNames": Object {
              "body": "UseCaseInstance",
              "query": "any",
              "response": "UseCaseResponse",
            },
            "verb": "put",
          },
          "output": "",
        }
      `);
    });

    it("should generate a request body type if it's inline in the specs", () => {
      const operation: OperationObject = {
        summary: "Update use case details",
        operationId: "updateUseCase",
        tags: ["use-case"],
        parameters: [
          {
            name: "useCaseId",
            in: "path",
            required: true,
            description: "The id of the use case",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    description: "The use case name",
                  },
                  description: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        responses: {
          "204": {
            description: "Use case updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UseCaseResponse" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "put", "/use-cases/{useCaseId}", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "UpdateUseCase",
            "description": "/**
         * Update use case details
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "updateUseCase",
              "parameters": Array [
                Object {
                  "description": "The id of the use case",
                  "in": "path",
                  "name": "useCaseId",
                  "required": true,
                  "schema": Object {
                    "format": "uuid",
                    "type": "string",
                  },
                },
              ],
              "requestBody": Object {
                "content": Object {
                  "application/json": Object {
                    "schema": Object {
                      "properties": Object {
                        "description": Object {
                          "type": "string",
                        },
                        "name": Object {
                          "description": "The use case name",
                          "type": "string",
                        },
                      },
                      "required": Array [
                        "name",
                      ],
                      "type": "object",
                    },
                  },
                },
                "required": true,
              },
              "responses": Object {
                "204": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/UseCaseResponse",
                      },
                    },
                  },
                  "description": "Use case updated",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "Update use case details",
              "tags": Array [
                "use-case",
              ],
            },
            "paramsInPath": Array [
              "useCaseId",
            ],
            "paramsTypes": "useCaseId: string",
            "route": "/use-cases/\${useCaseId}",
            "typeNames": Object {
              "body": "UpdateUseCaseRequestBody",
              "query": "any",
              "response": "UseCaseResponse",
            },
            "verb": "put",
          },
          "output": "
              export interface UpdateUseCaseRequestBody {
          /**
           * The use case name
           */
          name: string;
          description?: string;
        }
            ",
        }
      `);
    });

    it("should generate a proper ComponentResponse type if the type is custom", () => {
      const operation: OperationObject = {
        summary: "Update use case details",
        operationId: "updateUseCase",
        tags: ["use-case"],
        parameters: [
          {
            name: "tenantId",
            in: "path",
            required: true,
            description: "The id of the Contiamo tenant",
            schema: { type: "string" },
          },
          {
            name: "useCaseId",
            in: "path",
            required: true,
            description: "The id of the use case",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UseCaseInstance" } } },
        },
        responses: {
          "204": {
            description: "Use case updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id"],
                  properties: {
                    id: {
                      type: "string",
                    },
                    name: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "put", "/use-cases/{useCaseId}", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "UpdateUseCase",
            "description": "/**
         * Update use case details
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "updateUseCase",
              "parameters": Array [
                Object {
                  "description": "The id of the Contiamo tenant",
                  "in": "path",
                  "name": "tenantId",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
                Object {
                  "description": "The id of the use case",
                  "in": "path",
                  "name": "useCaseId",
                  "required": true,
                  "schema": Object {
                    "format": "uuid",
                    "type": "string",
                  },
                },
              ],
              "requestBody": Object {
                "content": Object {
                  "application/json": Object {
                    "schema": Object {
                      "$ref": "#/components/schemas/UseCaseInstance",
                    },
                  },
                },
                "required": true,
              },
              "responses": Object {
                "204": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "properties": Object {
                          "id": Object {
                            "type": "string",
                          },
                          "name": Object {
                            "type": "string",
                          },
                        },
                        "required": Array [
                          "id",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Use case updated",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "Update use case details",
              "tags": Array [
                "use-case",
              ],
            },
            "paramsInPath": Array [
              "useCaseId",
            ],
            "paramsTypes": "useCaseId: string",
            "route": "/use-cases/\${useCaseId}",
            "typeNames": Object {
              "body": "UseCaseInstance",
              "query": "any",
              "response": "UpdateUseCaseResponse",
            },
            "verb": "put",
          },
          "output": "
              export interface UpdateUseCaseResponse {
          id: string;
          name?: string;
        }
            ",
        }
      `);
    });

    it("should ignore 3xx responses", () => {
      const operation: OperationObject = {
        summary: "Update use case details",
        operationId: "updateUseCase",
        tags: ["use-case"],
        parameters: [
          {
            name: "tenantId",
            in: "path",
            required: true,
            description: "The id of the Contiamo tenant",
            schema: { type: "string" },
          },
          {
            name: "useCaseId",
            in: "path",
            required: true,
            description: "The id of the use case",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UseCaseInstance" } } },
        },
        responses: {
          "204": {
            description: "Use case updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id"],
                  properties: {
                    id: {
                      type: "string",
                    },
                    name: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
          "302": {
            $ref: "#/components/responses/LongPollingTimeout",
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "put", "/use-cases/{useCaseId}", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "UpdateUseCase",
            "description": "/**
         * Update use case details
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "updateUseCase",
              "parameters": Array [
                Object {
                  "description": "The id of the Contiamo tenant",
                  "in": "path",
                  "name": "tenantId",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
                Object {
                  "description": "The id of the use case",
                  "in": "path",
                  "name": "useCaseId",
                  "required": true,
                  "schema": Object {
                    "format": "uuid",
                    "type": "string",
                  },
                },
              ],
              "requestBody": Object {
                "content": Object {
                  "application/json": Object {
                    "schema": Object {
                      "$ref": "#/components/schemas/UseCaseInstance",
                    },
                  },
                },
                "required": true,
              },
              "responses": Object {
                "204": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "properties": Object {
                          "id": Object {
                            "type": "string",
                          },
                          "name": Object {
                            "type": "string",
                          },
                        },
                        "required": Array [
                          "id",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "Use case updated",
                },
                "302": Object {
                  "$ref": "#/components/responses/LongPollingTimeout",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "Update use case details",
              "tags": Array [
                "use-case",
              ],
            },
            "paramsInPath": Array [
              "useCaseId",
            ],
            "paramsTypes": "useCaseId: string",
            "route": "/use-cases/\${useCaseId}",
            "typeNames": Object {
              "body": "UseCaseInstance",
              "query": "any",
              "response": "UpdateUseCaseResponse",
            },
            "verb": "put",
          },
          "output": "
              export interface UpdateUseCaseResponse {
          id: string;
          name?: string;
        }
            ",
        }
      `);
    });

    it("should ignore the last param of a delete call (the id is give after)", () => {
      const operation: OperationObject = {
        summary: "Delete use case",
        operationId: "deleteUseCase",
        tags: ["use-case"],
        parameters: [
          {
            name: "tenantId",
            in: "path",
            required: true,
            description: "The id of the Contiamo tenant",
            schema: { type: "string" },
          },
          {
            name: "useCaseId",
            in: "path",
            required: true,
            description: "The id of the use case",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "204": {
            description: "Empty response",
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "delete", "/use-cases/{useCaseId}", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "DeleteUseCase",
            "description": "/**
         * Delete use case
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "deleteUseCase",
              "parameters": Array [
                Object {
                  "description": "The id of the Contiamo tenant",
                  "in": "path",
                  "name": "tenantId",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
                Object {
                  "description": "The id of the use case",
                  "in": "path",
                  "name": "useCaseId",
                  "required": true,
                  "schema": Object {
                    "format": "uuid",
                    "type": "string",
                  },
                },
              ],
              "responses": Object {
                "204": Object {
                  "description": "Empty response",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "Delete use case",
              "tags": Array [
                "use-case",
              ],
            },
            "paramsInPath": Array [
              "useCaseId",
            ],
            "paramsTypes": "useCaseId: string",
            "route": "/use-cases/\${useCaseId}",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "void",
            },
            "verb": "delete",
          },
          "output": "",
        }
      `);
    });
    it("should only remove the last params in delete operation", () => {
      const operation: OperationObject = {
        summary: "Delete use case",
        operationId: "deleteUseCase",
        tags: ["use-case"],
        parameters: [
          {
            name: "tenantId",
            in: "path",
            required: true,
            description: "The id of the Contiamo tenant",
            schema: { type: "string" },
          },
          {
            name: "useCaseId",
            in: "path",
            required: true,
            description: "The id of the use case",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "204": {
            description: "Empty response",
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "delete", "/use-cases/{useCaseId}/secret", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "DeleteUseCase",
            "description": "/**
         * Delete use case
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [],
            "operation": Object {
              "operationId": "deleteUseCase",
              "parameters": Array [
                Object {
                  "description": "The id of the Contiamo tenant",
                  "in": "path",
                  "name": "tenantId",
                  "required": true,
                  "schema": Object {
                    "type": "string",
                  },
                },
                Object {
                  "description": "The id of the use case",
                  "in": "path",
                  "name": "useCaseId",
                  "required": true,
                  "schema": Object {
                    "format": "uuid",
                    "type": "string",
                  },
                },
              ],
              "responses": Object {
                "204": Object {
                  "description": "Empty response",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "Delete use case",
              "tags": Array [
                "use-case",
              ],
            },
            "paramsInPath": Array [
              "useCaseId",
            ],
            "paramsTypes": "useCaseId: string",
            "route": "/use-cases/\${useCaseId}/secret",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "void",
            },
            "verb": "delete",
          },
          "output": "",
        }
      `);
    });

    it("should generate a Poll compoment if the `prefer` token is present", () => {
      const operation: OperationObject = {
        summary: "List all fields for the use case schema",
        operationId: "listFields",
        tags: ["schema"],
        parameters: [
          {
            name: "prefer",
            in: "header",
            schema: {
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            description: "An array of schema fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FieldListResponse" } } },
          },
          default: {
            description: "unexpected error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/APIError" },
                example: { errors: ["msg1", "msg2"] },
              },
            },
          },
        },
      };

      expect(generateRestfulComponent(operation, "get", "/fields", [])).toMatchInlineSnapshot(`
        Object {
          "component": Object {
            "componentName": "ListFields",
            "description": "/**
         * List all fields for the use case schema
         */
        ",
            "errorTypes": "APIError",
            "headerParams": Array [
              Object {
                "in": "header",
                "name": "prefer",
                "schema": Object {
                  "type": "string",
                },
              },
            ],
            "operation": Object {
              "operationId": "listFields",
              "parameters": Array [
                Object {
                  "in": "header",
                  "name": "prefer",
                  "schema": Object {
                    "type": "string",
                  },
                },
              ],
              "responses": Object {
                "200": Object {
                  "content": Object {
                    "application/json": Object {
                      "schema": Object {
                        "$ref": "#/components/schemas/FieldListResponse",
                      },
                    },
                  },
                  "description": "An array of schema fields",
                },
                "default": Object {
                  "content": Object {
                    "application/json": Object {
                      "example": Object {
                        "errors": Array [
                          "msg1",
                          "msg2",
                        ],
                      },
                      "schema": Object {
                        "$ref": "#/components/schemas/APIError",
                      },
                    },
                  },
                  "description": "unexpected error",
                },
              },
              "summary": "List all fields for the use case schema",
              "tags": Array [
                "schema",
              ],
            },
            "paramsInPath": Array [],
            "paramsTypes": "",
            "route": "/fields",
            "typeNames": Object {
              "body": "any",
              "query": "any",
              "response": "FieldListResponse",
            },
            "verb": "get",
          },
          "output": "",
        }
      `);
    });
  });
  it("should deal with no 2xx response case", () => {
    const operation: OperationObject = {
      summary: "List all fields for the use case schema",
      operationId: "listFields",
      responses: {
        "302": {
          description: "Just redirect",
        },
        default: {
          description: "unexpected error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/APIError" },
              example: { errors: ["msg1", "msg2"] },
            },
          },
        },
      },
    };

    expect(generateRestfulComponent(operation, "get", "/fields", [])).toMatchInlineSnapshot(`
      Object {
        "component": Object {
          "componentName": "ListFields",
          "description": "/**
       * List all fields for the use case schema
       */
      ",
          "errorTypes": "APIError",
          "headerParams": Array [],
          "operation": Object {
            "operationId": "listFields",
            "responses": Object {
              "302": Object {
                "description": "Just redirect",
              },
              "default": Object {
                "content": Object {
                  "application/json": Object {
                    "example": Object {
                      "errors": Array [
                        "msg1",
                        "msg2",
                      ],
                    },
                    "schema": Object {
                      "$ref": "#/components/schemas/APIError",
                    },
                  },
                },
                "description": "unexpected error",
              },
            },
            "summary": "List all fields for the use case schema",
          },
          "paramsInPath": Array [],
          "paramsTypes": "",
          "route": "/fields",
          "typeNames": Object {
            "body": "any",
            "query": "any",
            "response": "void",
          },
          "verb": "get",
        },
        "output": "",
      }
    `);
  });

  describe("reactPropsValueToObjectValue", () => {
    it("should remove the curly braces", () => {
      expect(reactPropsValueToObjectValue("{getConfig('plop')}")).toEqual("getConfig('plop')");
    });
    it("should do nothing", () => {
      expect(reactPropsValueToObjectValue('"hello"')).toEqual('"hello"');
    });
  });
});
