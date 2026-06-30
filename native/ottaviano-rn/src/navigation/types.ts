import type { NavigatorScreenParams } from "@react-navigation/native";

/** Navigation param lists — the React Navigation analogue of the old expo-router
 *  file routes. The operator surfaces are a single `OperatorSurface` screen keyed
 *  by `path` (the web href), so the drawer re-points it in place. */

export type CustomerTabParamList = {
  Menu: undefined;
  Rewards: undefined;
  Orders: undefined;
  More: undefined;
};

export type CustomerStackParamList = {
  Tabs: NavigatorScreenParams<CustomerTabParamList> | undefined;
  Cart: undefined;
  OrderTracker: { id: string };
};

export type OperatorStackParamList = {
  OperatorLogin: undefined;
  OperatorSurface: { path: string };
};

export type RootStackParamList = {
  Launch: undefined;
  Customer: NavigatorScreenParams<CustomerStackParamList> | undefined;
  Operator: NavigatorScreenParams<OperatorStackParamList> | undefined;
};
