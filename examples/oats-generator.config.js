/**
 * Example config for `yarn example:advanced`
 */

const { camel } = require("case");

module.exports = {
  "petstore-file": {
    file: "examples/petstore.yaml",
    output: "examples/default.ts",
  },
  "petstore-axios": {
    file: "examples/petstore.yaml",
    output: "examples/axios.ts",
    customImport: `
      import axios, { AxiosRequestConfig } from 'axios'
      export const clientInstance = axios.create();
    `,
    customGenerator: ({ componentName, verb, route, typeNames, paramsTypes }) => {
      if (verb === "get") {
        return `
          export const ${camel(componentName)} = (${paramsTypes ? paramsTypes + "," : ""}params?: ${
          typeNames.query
        }, config?: AxiosRequestConfig) => clientInstance.get<${
          typeNames.response
        }>(\`${route}\`, { ...config, params })
        `;
      } else {
        return `
          export const ${camel(componentName)} = (${paramsTypes ? paramsTypes + "," : ""}body: ${
          typeNames.body
        }, config?: AxiosRequestConfig) => clientInstance.${verb}<${typeNames.response}>(\`${route}\`, body, config)
        `;
      }
    },
  },
  "petstore-custom-operation": {
    file: "examples/petstore.yaml",
    output: "examples/operationId.ts",
    customOperationNameGenerator: ({ verb, route }) => {
      const words = route.replace("/api/v1/", "").split("/");

      const entities = words.filter((word) => !word.includes("{"));
      const operators = words
        .filter((word) => word.includes("{"))
        .map((word) => {
          return camel(["by", word].join(" "));
        });

      return camel([verb, ...entities, ...operators].join(" "));
    },
    customImport: `
      import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
    `,
    customGenerator: ({ componentName, verb, route, typeNames, paramsTypes }) => {
      if (verb === "get") {
        return `
          ${camel(componentName)}: (${paramsTypes ? paramsTypes + "," : ""}params?: ${
          typeNames.query
        }, config?: AxiosRequestConfig) => client.get<${typeNames.response}>(\`${route}\`, { ...config, params }),
        `;
      } else {
        return `
          ${camel(componentName)}: (${paramsTypes ? paramsTypes + "," : ""}body: ${
          typeNames.body
        }, config?: AxiosRequestConfig) => client.${verb}<${typeNames.response}>(\`${route}\`, body, config),
        `;
      }
    },
    customGeneratorWrap: (children) => {
      return `
      export function createApi(client: AxiosInstance) {
        return {
          ${children}
        }
      }
      `;
    },
  },
  "petstore-swr": {
    file: "examples/petstore.yaml",
    output: "examples/swr.ts",
    customImport: `
      import useSWR from "swr";
      import { fetcherFn, ConfigInterface } from "swr/dist/types";
    `,
    customGenerator: ({ componentName, verb, route, typeNames, paramsTypes }) => {
      if (verb === "get") {
        /**
         * export const useListPets = <Data = any, Error = any>(
            fetcher?: fetcherFn<Data>,
            config?: ConfigInterface<Data, Error>,
          ) => useSWR<Data, Error>(`/pets`, fetcher, config);
         */

        return `
          export const use${componentName} = <Data = ${typeNames.response}, Error = any>(${
          paramsTypes ? paramsTypes + "," : ""
        }fetcher?: fetcherFn<Data>, config?: ConfigInterface<Data, Error>) => useSWR<Data, Error>(\`${route}\`, fetcher, config)
        `;
      } else {
        return "";
      }
    },
  },
};
