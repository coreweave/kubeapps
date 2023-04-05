// Copyright 2018-2022 the Kubeapps contributors.
// SPDX-License-Identifier: Apache-2.0

import { CdsControlMessage, CdsFormGroup } from "@cds/react/forms";
import { CdsInput } from "@cds/react/input";
import { CdsSelect } from "@cds/react/select";
import actions from "actions";
import { handleErrorAction } from "actions/auth";
import AvailablePackageDetailExcerpt from "components/Catalog/AvailablePackageDetailExcerpt";
import Alert from "components/js/Alert";
import Column from "components/js/Column";
import Row from "components/js/Row";
import Button from "components/js/Button";
import LoadingWrapper from "components/LoadingWrapper";
import PackageHeader from "components/PackageHeader/PackageHeader";
import { push } from "connected-react-router";
import {
  AvailablePackageReference,
  ReconciliationOptions,
} from "gen/kubeappsapis/core/packages/v1alpha1/packages";
import { Plugin } from "gen/kubeappsapis/core/plugins/v1alpha1/plugins";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as ReactRouter from "react-router-dom";
import { Action } from "redux";
import { ThunkDispatch } from "redux-thunk";
import { Kube } from "shared/Kube";
import { FetchError, IStoreState } from "shared/types";
import * as url from "shared/url";
import { getPluginsAllowingSA, getPluginsRequiringSA, k8sObjectNameRegex } from "shared/utils";
import DeploymentFormBody from "./DeploymentFormBody";
interface IRouteParams {
  cluster: string;
  namespace: string;
  pluginName: string;
  pluginVersion: string;
  packageCluster: string;
  packageNamespace: string;
  packageId: string;
  packageVersion?: string;
}

export default function DeploymentForm() {
  const dispatch: ThunkDispatch<IStoreState, null, Action> = useDispatch();
  const {
    cluster: targetCluster,
    namespace: targetNamespace,
    packageId,
    pluginName,
    pluginVersion,
    packageCluster,
    packageNamespace,
    packageVersion,
  } = ReactRouter.useParams() as IRouteParams;
  const {
    packages: { isFetching: packagesIsFetching, selected: selectedPackage },
    apps,
  } = useSelector((state: IStoreState) => state);

  const [isDeploying, setDeploying] = useState(false);
  const [releaseName, setReleaseName] = useState("");
  const [appValues, setAppValues] = useState(selectedPackage.values || "");
  const [valuesModified, setValuesModified] = useState(false);
  const [serviceAccountList, setServiceAccountList] = useState([] as string[]);
  const [reconciliationOptions, setReconciliationOptions] = useState({} as ReconciliationOptions);
  const formRef = useRef<HTMLFormElement>(null);

  const error = apps.error || selectedPackage.error;

  const [pluginObj] = useState({ name: pluginName, version: pluginVersion } as Plugin);
  const [canDeploy, setCanDeploy] = useState(false);
  const [hasCheckedPermission, setHasCheckedPermission] = useState(false);

  const onChangeSA = (e: React.FormEvent<HTMLSelectElement>) => {
    setReconciliationOptions({
      ...reconciliationOptions,
      serviceAccountName: e.currentTarget.value,
    });
  };

  const [packageReference] = useState({
    context: {
      cluster: packageCluster,
      namespace: packageNamespace,
    },
    plugin: pluginObj,
    identifier: packageId,
  } as AvailablePackageReference);

  useEffect(() => {
    // Get the package details
    dispatch(
      actions.availablepackages.fetchAndSelectAvailablePackageDetail(
        packageReference,
        packageVersion,
      ),
    );
    // Populate the rest of packages versions
    dispatch(actions.availablepackages.fetchAvailablePackageVersions(packageReference));
    return () => {};
  }, [dispatch, packageReference, packageVersion]);

  useEffect(() => {
    // Populate the service account list if the plugin requires it
    if (getPluginsAllowingSA().includes(pluginObj.name)) {
      // We assume the user has enough permissions to do that. Fallback to a simple input maybe?
      Kube.getServiceAccountNames(targetCluster, targetNamespace)
        .then(saList => setServiceAccountList(saList.serviceaccountNames))
        ?.catch(e => {
          dispatch(handleErrorAction(e));
        });
    }
    return () => {};
  }, [dispatch, targetCluster, targetNamespace, pluginObj.name]);

  useEffect(() => {
    if (!valuesModified) {
      setAppValues(selectedPackage.values || "");
    }
    return () => {};
  }, [selectedPackage.values, valuesModified]);

  const handleValuesChange = (value: string) => {
    setAppValues(value);
  };

  const setValuesModifiedTrue = () => {
    setValuesModified(true);
  };

  const handleReleaseNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReleaseName(e.target.value);
  };

  function getCookie(name: any) {
    const value = `; ${document.cookie}`;
    const parts = value?.split(`; ${name}=`);
    if (parts && parts.length === 2) {
      return parts.pop()?.split(";").shift();
    } else {
      return null;
    }
  }

  const cloudDomain = window.location.origin.replace(/apps/g, "cloud");
  const csrfToken = window.location.origin.includes("apps.staging.coreweave")
    ? getCookie("csrftoken_sta")
    : getCookie("csrftoken");
  useEffect(() => {
    fetch(`${cloudDomain}/api/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrftoken": csrfToken || "",
      },
      body: JSON.stringify({
        query: `
        query User {
          user {
              ... on User {
                  id
                  email
                  hasPassword
                  mfaEnabled
                  firstName
                  lastName
                  organization {
                      id
                      subscribed
                      displayName
                      latestSiftDecision
                  }
                  permissions
                  userSettings {
                      defaultNamespace
                  }
                  __typename
              }
      
              ... on Errors {
                  code
                  errors {
                      message
                      path
                  }
              }
          }
        }
      `,
      }),
    })
      .then(res => res.json())
      .then(result => {
        const userPermissions = result.data.user.permissions;
        if (
          userPermissions.includes(`w:ns-${targetNamespace}:full`) ||
          (userPermissions.includes(`w:ns-${targetNamespace}:virtualservers`) &&
            selectedPackage.availablePackageDetail?.name === "virtual-server")
        ) {
          setCanDeploy(true);
        } else {
          setCanDeploy(false);
        }
        setHasCheckedPermission(true);
      });
  });

  const handleDeploy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeploying(true);
    if (selectedPackage.availablePackageDetail) {
      const deployed = await dispatch(
        // Installation always happen in the cluster/namespace passed in the URL
        actions.installedpackages.installPackage(
          targetCluster,
          targetNamespace,
          selectedPackage.availablePackageDetail,
          releaseName,
          appValues,
          selectedPackage.schema,
          reconciliationOptions,
        ),
      );
      setDeploying(false);
      if (deployed) {
        dispatch(
          push(
            // Redirect to the installed package, note that the cluster/ns are the ones passed
            // in the URL, not the ones from the package.
            url.app.apps.get({
              context: { cluster: targetCluster, namespace: targetNamespace },
              plugin: pluginObj,
              identifier: releaseName,
            } as AvailablePackageReference),
          ),
        );
      }
    }
  };

  const selectVersion = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(
      push(
        url.app.apps.new(targetCluster, targetNamespace, packageReference, e.currentTarget.value),
      ),
    );
  };

  if (error?.constructor === FetchError) {
    return (
      error && (
        <Alert theme="danger">
          Unable to retrieve the current app: {(error as FetchError).message}
        </Alert>
      )
    );
  }

  if (!selectedPackage.availablePackageDetail) {
    return (
      <LoadingWrapper
        className="margin-t-xxl"
        loadingText={`Fetching ${decodeURIComponent(packageId)}...`}
      />
    );
  }
  /* eslint-disable jsx-a11y/label-has-associated-control */
  return (
    <section>
      <PackageHeader
        availablePackageDetail={selectedPackage.availablePackageDetail}
        versions={selectedPackage.versions}
        onSelect={selectVersion}
        selectedVersion={selectedPackage.pkgVersion}
      />
      {isDeploying && (
        <h3 className="center" style={{ marginBottom: "1.2rem" }}>
          Hang tight, the application is being deployed...
        </h3>
      )}
      <LoadingWrapper loaded={!isDeploying && hasCheckedPermission}>
        <Row>
          <Column span={3}>
            <AvailablePackageDetailExcerpt pkg={selectedPackage.availablePackageDetail} />
          </Column>
          <Column span={9}>
            {!canDeploy && hasCheckedPermission ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "80px 200px",
                }}
              >
                <h2
                  style={{
                    textAlign: "center",
                    paddingBottom: "20px",
                  }}
                >
                  {`You do not have access to our ${selectedPackage.availablePackageDetail?.name} application 😞. Please reach out to our support team to get your account upgraded.`}
                </h2>
                <Button externalLink={`${cloudDomain}/contact`}>Request permission upgrade</Button>
              </div>
            ) : (
              <>
                {error && <Alert theme="danger">An error occurred: {error.message}</Alert>}
                <form onSubmit={handleDeploy} ref={formRef}>
                  <CdsFormGroup
                    validate={true}
                    className="deployment-form"
                    layout="vertical"
                    controlWidth="shrink"
                  >
                    <CdsInput>
                      <label>Name</label>
                      <input
                        id="releaseName"
                        pattern={k8sObjectNameRegex}
                        title="Use lowercase alphanumeric characters, '-' or '.'"
                        onChange={handleReleaseNameChange}
                        value={releaseName}
                        required={true}
                      />
                      <CdsControlMessage error="valueMissing">
                        A descriptive name for this application
                      </CdsControlMessage>
                    </CdsInput>
                    {
                      // TODO(agamez): let plugins define their own components instead of hardcoding the logic here
                      getPluginsAllowingSA().includes(pluginObj.name) ? (
                        <>
                          <CdsSelect layout="horizontal" id="serviceaccount-selector">
                            <label>Service Account</label>
                            <select
                              value={reconciliationOptions.serviceAccountName}
                              onChange={onChangeSA}
                              required={getPluginsRequiringSA().includes(pluginObj.name)}
                            >
                              <option key=""></option>
                              {serviceAccountList?.map(o => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                            <CdsControlMessage error="valueMissing">
                              The Service Account name this application will be installed with.
                            </CdsControlMessage>
                          </CdsSelect>
                        </>
                      ) : (
                        <></>
                      )
                    }
                  </CdsFormGroup>
                  <DeploymentFormBody
                    deploymentEvent="install"
                    packageId={packageId}
                    packageVersion={packageVersion!}
                    packagesIsFetching={packagesIsFetching}
                    selected={selectedPackage}
                    setValues={handleValuesChange}
                    appValues={appValues}
                    setValuesModified={setValuesModifiedTrue}
                    formRef={formRef}
                  />
                </form>
              </>
            )}
          </Column>
        </Row>
      </LoadingWrapper>
    </section>
  );
}
