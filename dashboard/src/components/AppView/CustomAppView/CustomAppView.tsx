import { IRelease, IStoreState } from "shared/types";
import { CustomComponent } from "RemoteComponent";
import { push } from "connected-react-router";
import actions from "actions";
import { useMemo, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as ReactRouter from "react-router";
import { IAppViewResourceRefs, IRouteParams } from "../AppView";
import * as urls from "../../../shared/url";

export interface ICustomAppViewProps {
  resourceRefs: IAppViewResourceRefs;
  app: IRelease;
}

function CustomAppView({ resourceRefs, app }: ICustomAppViewProps) {
  const dispatch = useDispatch();
  const { cluster, namespace, releaseName } = ReactRouter.useParams() as IRouteParams;

  useEffect(() => {
    dispatch(actions.apps.getApp(cluster, namespace, releaseName));
  }, [cluster, dispatch, namespace, releaseName]);

  const handleDelete = useCallback(
    () => dispatch(actions.apps.deleteApp(cluster, namespace, releaseName, true)),
    [dispatch, cluster, namespace, releaseName],
  );

  const handleRollback = useCallback(
    () => dispatch(actions.apps.rollbackApp(cluster, namespace, releaseName, 1)),
    [dispatch, cluster, namespace, releaseName],
  );

  const handleRedirect = useCallback(url => dispatch(push(url)), [dispatch]);

  const {
    config: { remoteComponentsUrl },
  } = useSelector((state: IStoreState) => state);

  const url = remoteComponentsUrl
    ? remoteComponentsUrl
    : `${window.location.origin}/custom_components.js`;

  return useMemo(
    () => (
      <CustomComponent
        url={url}
        resourceRefs={resourceRefs}
        handleDelete={handleDelete}
        handleRollback={handleRollback}
        handleRedirect={handleRedirect}
        urls={urls}
        app={app}
      />
    ),
    [resourceRefs, app, url, handleDelete, handleRollback, handleRedirect],
  );
}

export default CustomAppView;
